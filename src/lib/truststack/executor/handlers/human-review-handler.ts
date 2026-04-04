import { sendEmail } from "./resend-client";
import { humanReviewTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

export async function humanReviewHandler(ctx: ActionExecutorContext): Promise<void> {
  const to =
    ctx.reviewerEmail ??
    process.env.TRUSTSTACK_REVIEWER_EMAIL ??
    ctx.adminEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(`[TrustStack] send_to_human_review: no reviewer email configured for case ${ctx.caseRef}. Set TRUSTSTACK_REVIEWER_EMAIL or TRUSTSTACK_ADMIN_EMAIL.`);
    return;
  }

  const template = humanReviewTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(`[TrustStack] send_to_human_review: RESEND_API_KEY not set — email skipped for case ${ctx.caseRef}`);
  }
}
