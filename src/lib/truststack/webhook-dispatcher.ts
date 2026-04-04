/**
 * webhook-dispatcher.ts
 *
 * Delivers signed webhook payloads to all registered WebhookEndpoint records
 * for the case owner that have subscribed to the fired event.
 *
 * Delivery rules:
 *   - Signs each request with HMAC-SHA256 of the JSON body using the endpoint secret
 *   - Retries once on non-2xx response after a 2 s delay
 *   - Logs delivery failures to Sentry (captureException) and console — never throws
 *   - All endpoints are dispatched in parallel; individual failures are isolated
 */

import { createHmac } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";

const RETRY_DELAY_MS = 2_000;

export type WebhookEvent = "analysis.completed" | "analysis.failed";

/** Shape of every outbound webhook body. */
export type WebhookPayload = {
  event:     WebhookEvent;
  caseId:    string;
  timestamp: string;
  data:      Record<string, unknown>;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up all active WebhookEndpoints for the case owner that subscribe to
 * the given event, then POST a signed payload to each in parallel.
 *
 * Safe to fire-and-forget — never throws.
 */
export async function dispatchWebhook(
  caseId:  string,
  event:   WebhookEvent,
  data:    Record<string, unknown>,
): Promise<void> {
  try {
    const cas = await db.case.findUnique({
      where:  { id: caseId },
      select: { userId: true },
    });
    if (!cas) return;

    // endpoints subscribed to this event OR with an empty events array (= all events)
    const endpoints = await db.webhookEndpoint.findMany({
      where: {
        userId: cas.userId,
        active: true,
        OR: [
          { events: { has: event } },
          { events: { isEmpty: true } },
        ],
      },
    });
    if (endpoints.length === 0) return;

    const payload: WebhookPayload = {
      event,
      caseId,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(
      endpoints.map((ep) => deliver(ep, event, body)),
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "webhook-dispatcher" } });
    console.error("[webhook] Unexpected error in dispatchWebhook:", err);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function deliver(
  endpoint: { id: string; url: string; secret: string },
  event:   string,
  body:    string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type":           "application/json",
    "X-TrustStack-Event":     event,
    "X-TrustStack-Signature": sign(endpoint.secret, body),
  };

  const attempt = () =>
    fetch(endpoint.url, { method: "POST", headers, body }).catch((err: unknown) => {
      // Network-level error (DNS, timeout, etc.)
      throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    });

  try {
    const res = await attempt();
    if (res.ok) return;

    // Non-2xx — retry once after delay
    console.warn(
      `[webhook] Endpoint ${endpoint.id} returned ${res.status} — retrying in ${RETRY_DELAY_MS}ms`,
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

    const res2 = await attempt();
    if (!res2.ok) {
      const msg = `Endpoint ${endpoint.id} returned ${res2.status} after retry`;
      console.error(`[webhook] ${msg}`);
      Sentry.captureMessage(msg, { level: "warning", tags: { endpointId: endpoint.id } });
    }
  } catch (err) {
    const msg = `Delivery to endpoint ${endpoint.id} failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[webhook] ${msg}`);
    Sentry.captureException(err, { tags: { endpointId: endpoint.id } });
  }
}
