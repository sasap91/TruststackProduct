/**
 * GET  /api/integrations/shopify — return connection status for the current user
 * DELETE /api/integrations/shopify — disconnect: revoke webhooks + delete record
 */

import { NextResponse } from "next/server";
import { auth }         from "@clerk/nextjs/server";
import { db }           from "@/lib/db";
import { decrypt }      from "@/lib/encryption";
import { deleteWebhook } from "@/lib/shopify-client";

export const runtime = "nodejs";

// GET — connection status (no sensitive fields returned)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const conn = await db.shopifyConnection.findUnique({
    where:  { userId },
    select: { shop: true, syncEnabled: true, createdAt: true, webhookIds: true },
  });

  if (!conn) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected:    true,
    shop:         conn.shop,
    syncEnabled:  conn.syncEnabled,
    webhookCount: conn.webhookIds.length,
    connectedAt:  conn.createdAt,
  });
}

// DELETE — disconnect: clean up Shopify webhooks, remove DB record
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const conn = await db.shopifyConnection.findUnique({ where: { userId } });
  if (!conn) return NextResponse.json({ error: "Not connected." }, { status: 404 });

  // Best-effort webhook cleanup — don't fail if Shopify is unreachable
  try {
    const accessToken = decrypt(conn.accessToken);
    await Promise.all(
      conn.webhookIds.map((id) =>
        deleteWebhook(conn.shop, accessToken, id).catch((err: unknown) =>
          console.warn(`[shopify] Failed to delete webhook ${id}:`, err),
        ),
      ),
    );
  } catch (err) {
    console.warn("[shopify] Token decryption failed during disconnect:", err);
  }

  await db.shopifyConnection.delete({ where: { userId } });

  return NextResponse.json({ ok: true });
}
