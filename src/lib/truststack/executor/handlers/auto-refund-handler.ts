import { db }              from "@/lib/db";
import { decrypt }         from "@/lib/encryption";
import { issueRefund }     from "@/lib/shopify-client";
import { sendEmail }       from "./resend-client";
import { autoRefundTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

/**
 * auto_refund / auto_approve handler.
 *
 * Priority:
 *   1. If the case has a shopifyOrderId AND the merchant has an active
 *      ShopifyConnection, issue the refund via the Shopify Admin API.
 *   2. Send an email notification (always, regardless of Shopify outcome).
 */
export async function autoRefundHandler(ctx: ActionExecutorContext): Promise<void> {
  // ── 1. Shopify refund ────────────────────────────────────────────────────
  if (ctx.shopifyOrderId) {
    try {
      const conn = await db.shopifyConnection.findUnique({
        where: { userId: ctx.userId },
      });

      if (conn?.syncEnabled) {
        const accessToken = decrypt(conn.accessToken);
        await issueRefund(
          conn.shop,
          accessToken,
          ctx.shopifyOrderId,
          ctx.claimValueUsd ?? 0,
        );
        console.info(
          `[TrustStack] Shopify refund issued for order ${ctx.shopifyOrderId} on ${conn.shop}`,
        );
      }
    } catch (err) {
      // Log but don't throw — email notification should still fire
      console.error(
        `[TrustStack] Shopify refund failed for case ${ctx.caseRef}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 2. Email notification ────────────────────────────────────────────────
  const to =
    ctx.claimantEmail ??
    ctx.merchantEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(
      `[TrustStack] auto_refund: no recipient configured for case ${ctx.caseRef}. ` +
      `Set TRUSTSTACK_ADMIN_EMAIL or provide claimantEmail in the case.`,
    );
    return;
  }

  const template = autoRefundTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(
      `[TrustStack] auto_refund: RESEND_API_KEY not set — email skipped for case ${ctx.caseRef}`,
    );
  }
}
