/**
 * shopify-client.ts
 *
 * Thin wrapper around the Shopify Admin REST API (2025-01).
 *
 * All functions are pure HTTP — no Prisma, no encryption, no side effects beyond
 * the network call. Callers decrypt the access token before passing it here.
 *
 * Exported:
 *   getOrder            — fetch a single order (for refund amount / transaction lookup)
 *   issueRefund         — POST a refund against an order
 *   registerWebhook     — subscribe to a Shopify topic
 *   deleteWebhook       — unsubscribe from a Shopify webhook
 *   verifyWebhookHmac   — verify X-Shopify-Hmac-Sha256 (testable, no side effects)
 */

import { createHmac, timingSafeEqual } from "crypto";

const API_VERSION = "2025-01" as const;

// ── Types ──────────────────────────���──────────────────────────────────────────

export type ShopifyTransaction = {
  id:       number;
  kind:     string;
  status:   string;
  amount:   string;
  currency: string;
  gateway:  string;
};

export type ShopifyOrder = {
  id:             number;
  name:           string;   // "#1001"
  email:          string;
  total_price:    string;
  currency:       string;
  financial_status: string;
  transactions:   ShopifyTransaction[];
};

export type ShopifyRefund = {
  id:       number;
  order_id: number;
  transactions: ShopifyTransaction[];
};

export type ShopifyWebhook = {
  id:      number;
  topic:   string;
  address: string;
  format:  string;
};

// ── Helpers ────────────────────────────────────────────────────────────��──────

function adminUrl(shop: string, path: string): string {
  return `https://${shop}/admin/api/${API_VERSION}/${path}`;
}

function headers(accessToken: string): Record<string, string> {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type":           "application/json",
  };
}

async function shopifyFetch<T>(
  url:          string,
  accessToken:  string,
  init?:        RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(accessToken), ...(init?.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify API ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

// ── Public API ──────────────────────────────��─────────────────────────────────

/**
 * Fetch a Shopify order by numeric ID.
 * Includes transactions so callers can identify the parent transaction for refunds.
 */
export async function getOrder(
  shop:        string,
  accessToken: string,
  orderId:     string | number,
): Promise<ShopifyOrder> {
  const data = await shopifyFetch<{ order: ShopifyOrder }>(
    adminUrl(shop, `orders/${orderId}.json?fields=id,name,email,total_price,currency,financial_status,transactions`),
    accessToken,
  );
  return data.order;
}

/**
 * Issue a refund against a Shopify order.
 *
 * @param amountUsd  Amount to refund in the order's currency. If 0 or absent,
 *                   the order's full total_price is used.
 */
export async function issueRefund(
  shop:        string,
  accessToken: string,
  orderId:     string | number,
  amountUsd:   number = 0,
): Promise<ShopifyRefund> {
  const order = await getOrder(shop, accessToken, orderId);

  // Find the first successful charge transaction to use as the parent
  const parentTx = order.transactions.find(
    (t) => t.kind === "sale" && t.status === "success",
  ) ?? order.transactions[0];

  if (!parentTx) {
    throw new Error(`Order ${orderId} has no transactions to refund against.`);
  }

  const amount = amountUsd > 0
    ? amountUsd.toFixed(2)
    : order.total_price;

  const data = await shopifyFetch<{ refund: ShopifyRefund }>(
    adminUrl(shop, `orders/${orderId}/refunds.json`),
    accessToken,
    {
      method: "POST",
      body:   JSON.stringify({
        refund: {
          notify:       true,
          transactions: [
            {
              parent_id: parentTx.id,
              amount,
              kind:      "refund",
              gateway:   parentTx.gateway,
            },
          ],
        },
      }),
    },
  );

  return data.refund;
}

/**
 * Register a webhook subscription.
 * Returns the created webhook (including its numeric `id` for later deletion).
 */
export async function registerWebhook(
  shop:        string,
  accessToken: string,
  topic:       string,
  address:     string,
): Promise<ShopifyWebhook> {
  const data = await shopifyFetch<{ webhook: ShopifyWebhook }>(
    adminUrl(shop, "webhooks.json"),
    accessToken,
    {
      method: "POST",
      body:   JSON.stringify({ webhook: { topic, address, format: "json" } }),
    },
  );
  return data.webhook;
}

/**
 * Delete a webhook subscription by its numeric ID.
 */
export async function deleteWebhook(
  shop:        string,
  accessToken: string,
  webhookId:   string | number,
): Promise<void> {
  const res = await fetch(adminUrl(shop, `webhooks/${webhookId}.json`), {
    method:  "DELETE",
    headers: headers(accessToken),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Shopify DELETE webhook ${webhookId} returned ${res.status}`);
  }
}

/**
 * Verify a Shopify webhook HMAC-SHA256 signature.
 *
 * Shopify sends `X-Shopify-Hmac-Sha256: base64(HMAC-SHA256(rawBody, webhookSecret))`.
 * Uses a timing-safe comparison to prevent timing attacks.
 *
 * @param rawBody       Raw request body bytes (before any JSON.parse)
 * @param headerValue   Value of the X-Shopify-Hmac-Sha256 header (base64)
 * @param secret        SHOPIFY_WEBHOOK_SECRET env var
 */
export function verifyWebhookHmac(
  rawBody:     string | Buffer,
  headerValue: string,
  secret:      string,
): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    const a = Buffer.from(expected);
    const b = Buffer.from(headerValue);

    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
