/**
 * DELETE /api/webhooks/:id — deactivate a webhook endpoint
 */

import { NextResponse } from "next/server";
import { auth }         from "@clerk/nextjs/server";
import { db }           from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;

  const updated = await db.webhookEndpoint.updateMany({
    where: { id, userId, active: true },
    data:  { active: false },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
