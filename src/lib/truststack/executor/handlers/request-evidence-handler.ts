import { sendEmail } from "./resend-client";
import { requestMoreEvidenceTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

export async function requestEvidenceHandler(ctx: ActionExecutorContext): Promise<void> {
  const to =
    ctx.claimantEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(`[TrustStack] request_more_evidence: no claimant email configured for case ${ctx.caseRef}. Set TRUSTSTACK_ADMIN_EMAIL.`);
    return;
  }

  const template = requestMoreEvidenceTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(`[TrustStack] request_more_evidence: RESEND_API_KEY not set — email skipped for case ${ctx.caseRef}`);
  }
}
