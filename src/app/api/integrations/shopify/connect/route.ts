/**
 * GET /api/integrations/shopify/connect?shop=mybrand.myshopify.com
 *
 * Initiates the Shopify OAuth flow. Redirects to Shopify's authorization URL.
 * The `state` parameter encodes a signed {userId, shop, ts} token so the
 * callback can authenticate the user without a session cookie.
 *
 * Required env vars: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
 * Optional env var:  NEXT_PUBLIC_APP_URL (defaults to request origin)
 */

import { NextResponse } from "next/server";
import { auth }         from "@clerk/nextjs/server";
import { createHmac }   from "crypto";

export const runtime = "nodejs";

const SHOPIFY_SCOPES = "read_orders,read_customers,write_refunds";

/** Validates the shop domain format (e.g. "mybrand.myshopify.com"). */
function isValidShop(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop);
}

/** Build a tamper-proof state token: base64url(payload) + "." + HMAC */
export function buildState(payload: Record<string, string>, secret: string): string {
  const json    = JSON.stringify(payload);
  const encoded = Buffer.from(json).toString("base64url");
  const sig     = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are not configured." },
      { status: 503 },
    );
  }

  const url  = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim().toLowerCase() ?? "";
  if (!shop || !isValidShop(shop)) {
    return NextResponse.json(
      { error: "shop must be a valid *.myshopify.com domain." },
      { status: 400 },
    );
  }

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;

  const state = buildState({ userId, shop, ts: Date.now().toString() }, clientSecret);

  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id",    clientId);
  authUrl.searchParams.set("scope",        SHOPIFY_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state",        state);

  return NextResponse.redirect(authUrl.toString());
}
