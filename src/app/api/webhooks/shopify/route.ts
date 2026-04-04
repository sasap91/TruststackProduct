/**
 * POST /api/webhooks/shopify
 *
 * Receives Shopify webhook events. Every delivery is verified with the
 * X-Shopify-Hmac-Sha256 header using SHOPIFY_WEBHOOK_SECRET.
 *
 * Handled topics:
 *
 *   orders/fulfilled  — upserts order metadata on the matching Case (if any)
 *                       for velocity lookups. Also updates Case.shopifyOrderId
 *                       when an existing open case matches the order email.
 *
 *   refunds/create    — appends a CaseEvent to the matching Case audit trail.
 *
 * Unknown topics are acknowledged with 200 (no action).
 * Signature failures return 401.
 */

import { NextResponse }       from "next/server";
import { db }                 from "@/lib/db";
import { verifyWebhookHmac }  from "@/lib/shopify-client";

export const runtime = "nodejs";

// ── Types ─────────────────────────────────────────────────────────────────────

type FulfilledOrderPayload = {
  id:          number;
  name:        string;   // e.g. "#1001"
  email?:      string;
  total_price: string;
  currency:    string;
  shipping_address?: {
    address1?: string;
    city?:     string;
    zip?:      string;
    country?:  string;
  };
  fulfillments?: Array<{
    tracking_number?: string;
    tracking_url?:    string;
    status:           string;
  }>;
};

type RefundCreatedPayload = {
  id:       number;
  order_id: number;
  note?:    string;
  transactions?: Array<{ amount: string; currency: string; kind: string }>;
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook secret not configured — reject all deliveries
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") ?? "";

  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    return NextResponse.json({ error: "Invalid HMAC." }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop  = request.headers.get("x-shopify-shop-domain") ?? "";

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    switch (topic) {
      case "orders/fulfilled":
        await handleOrderFulfilled(shop, payload as FulfilledOrderPayload);
        break;
      case "refunds/create":
        await handleRefundCreated(shop, payload as RefundCreatedPayload);
        break;
      default:
        // Acknowledge unknown topics without action
        break;
    }
  } catch (err) {
    console.error(`[shopify-webhook] Handler error for topic "${topic}":`, err);
    // Return 200 to prevent Shopify from retrying on transient DB errors
  }

  return NextResponse.json({ ok: true });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * orders/fulfilled
 *
 * If an open Case exists for the same email, attach the Shopify order ID so
 * the auto-refund action can issue the refund via API. Also write a CaseEvent
 * for the audit trail.
 */
async function handleOrderFulfilled(
  shop:    string,
  payload: FulfilledOrderPayload,
): Promise<void> {
  const orderId    = String(payload.id);
  const orderEmail = payload.email?.toLowerCase().trim();

  if (!orderEmail) return;

  // Look up the ShopifyConnection to scope the query to the right merchant
  const conn = await db.shopifyConnection.findFirst({
    where: { shop },
    select: { userId: true },
  });
  if (!conn) return;

  // Find a recent open or analyzing case for this user + email
  const openCase = await db.case.findFirst({
    where: {
      userId: conn.userId,
      email:  orderEmail,
      status: { in: ["OPEN", "ANALYZING", "PENDING_REVIEW"] },
    },
    orderBy: { createdAt: "desc" },
    select:  { id: true },
  });

  if (openCase) {
    await db.case.update({
      where: { id: openCase.id },
      data: {
        shopifyOrderId: orderId,
        // Claimant email confirmed — also normalise
        email:          orderEmail,
        events: {
          create: {
            actor:   "system",
            type:    "shopify_order_fulfilled",
            payload: {
              shopifyOrderId:  orderId,
              orderName:       payload.name,
              totalPrice:      payload.total_price,
              currency:        payload.currency,
              trackingNumber:  payload.fulfillments?.[0]?.tracking_number ?? null,
            },
          },
        },
      },
    });
  }
}

/**
 * refunds/create
 *
 * Append a refund event to the matching Case (matched by shopifyOrderId).
 */
async function handleRefundCreated(
  shop:    string,
  payload: RefundCreatedPayload,
): Promise<void> {
  const orderId = String(payload.order_id);

  const conn = await db.shopifyConnection.findFirst({
    where:  { shop },
    select: { userId: true },
  });
  if (!conn) return;

  const matchingCase = await db.case.findFirst({
    where:  { userId: conn.userId, shopifyOrderId: orderId },
    select: { id: true },
  });
  if (!matchingCase) return;

  const tx = payload.transactions?.[0];
  await db.caseEvent.create({
    data: {
      caseId:  matchingCase.id,
      actor:   "system",
      type:    "shopify_refund_created",
      payload: {
        shopifyRefundId: payload.id,
        shopifyOrderId:  orderId,
        note:            payload.note ?? null,
        amount:          tx?.amount ?? null,
        currency:        tx?.currency ?? null,
      },
    },
  });
}
