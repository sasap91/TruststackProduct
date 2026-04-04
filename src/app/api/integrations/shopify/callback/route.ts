/**
 * GET /api/integrations/shopify/callback
 *
 * Shopify OAuth callback. Verifies both the state HMAC and Shopify's own HMAC
 * of the request params, exchanges the code for an access token, stores it
 * encrypted, registers webhooks, then redirects to /settings/integrations.
 */

import { NextResponse } from "next/server";
import { createHmac }   from "crypto";
import { db }           from "@/lib/db";
import { encrypt }      from "@/lib/encryption";
import { registerWebhook } from "@/lib/shopify-client";

export const runtime = "nodejs";

/** Verify the state token built by the connect route. */
function verifyState(
  state:  string,
  secret: string,
): { userId: string; shop: string } | null {
  try {
    const dot     = state.lastIndexOf(".");
    if (dot === -1) return null;
    const encoded = state.slice(0, dot);
    const sig     = state.slice(dot + 1);
    const expected = createHmac("sha256", secret).update(encoded).digest("hex");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString()) as { userId: string; shop: string };
  } catch {
    return null;
  }
}

/**
 * Verify Shopify's HMAC of the OAuth callback query params.
 * Shopify signs all params except `hmac` itself, sorted lexicographically.
 */
function verifyShopifyOAuthHmac(
  params:       URLSearchParams,
  clientSecret: string,
): boolean {
  const hmac     = params.get("hmac") ?? "";
  const sorted   = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", clientSecret).update(sorted).digest("hex");
  return hmac === expected;
}

const WEBHOOK_TOPICS = ["orders/fulfilled", "refunds/create"] as const;

export async function GET(request: Request) {
  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "OAuth not configured." }, { status: 503 });
  }

  const url    = new URL(request.url);
  const params = url.searchParams;

  // 1. Verify Shopify's HMAC of the callback params
  if (!verifyShopifyOAuthHmac(params, clientSecret)) {
    return NextResponse.json({ error: "Invalid HMAC — request may have been tampered." }, { status: 401 });
  }

  // 2. Verify our state token and extract userId + expected shop
  const stateStr = params.get("state") ?? "";
  const statePayload = verifyState(stateStr, clientSecret);
  if (!statePayload) {
    return NextResponse.json({ error: "Invalid or expired state." }, { status: 401 });
  }

  const shop = params.get("shop") ?? "";
  if (shop !== statePayload.shop) {
    return NextResponse.json({ error: "Shop mismatch." }, { status: 401 });
  }

  const code = params.get("code") ?? "";
  if (!code) {
    return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
  }

  // 3. Exchange code for access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Token exchange failed." }, { status: 502 });
  }
  const { access_token } = await tokenRes.json() as { access_token: string };

  // 4. Encrypt and persist the connection
  const encryptedToken = encrypt(access_token);
  await db.shopifyConnection.upsert({
    where:  { userId: statePayload.userId },
    create: {
      userId:      statePayload.userId,
      shop,
      accessToken: encryptedToken,
      webhookIds:  [],
      syncEnabled: true,
    },
    update: {
      shop,
      accessToken: encryptedToken,
      syncEnabled: true,
    },
  });

  // 5. Register webhooks (best effort — don't fail the OAuth flow on partial errors)
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const hookTarget = `${appUrl}/api/webhooks/shopify`;
  const registeredIds: string[] = [];

  for (const topic of WEBHOOK_TOPICS) {
    try {
      const hook = await registerWebhook(shop, access_token, topic, hookTarget);
      registeredIds.push(String(hook.id));
    } catch (err) {
      console.error(`[shopify-oauth] Failed to register webhook "${topic}":`, err);
    }
  }

  if (registeredIds.length > 0) {
    await db.shopifyConnection.update({
      where: { userId: statePayload.userId },
      data:  { webhookIds: registeredIds },
    });
  }

  // 6. Redirect to integrations settings
  return NextResponse.redirect(`${appUrl}/settings/integrations?connected=1`);
}
