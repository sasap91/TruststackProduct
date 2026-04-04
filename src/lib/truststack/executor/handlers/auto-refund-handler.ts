import { sendEmail } from "./resend-client";
import { autoRefundTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

export async function autoRefundHandler(ctx: ActionExecutorContext): Promise<void> {
  const to =
    ctx.claimantEmail ??
    ctx.merchantEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(`[TrustStack] auto_refund: no recipient configured for case ${ctx.caseRef}. Set TRUSTSTACK_ADMIN_EMAIL.`);
    return;
  }

  const template = autoRefundTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(`[TrustStack] auto_refund: RESEND_API_KEY not set — email skipped for case ${ctx.caseRef}`);
  }
}
