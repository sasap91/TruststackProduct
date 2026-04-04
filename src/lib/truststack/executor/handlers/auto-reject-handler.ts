import { sendEmail } from "./resend-client";
import { autoRejectTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

export async function autoRejectHandler(ctx: ActionExecutorContext): Promise<void> {
  const to =
    ctx.claimantEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(`[TrustStack] auto_reject: no recipient configured for case ${ctx.caseRef}. Set TRUSTSTACK_ADMIN_EMAIL.`);
    return;
  }

  const template = autoRejectTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(`[TrustStack] auto_reject: RESEND_API_KEY not set — email skipped for case ${ctx.caseRef}`);
  }
}
