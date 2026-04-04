import { db } from "@/lib/db";
import { sendEmail } from "./resend-client";
import { blockAndFlagTemplate } from "./email-templates";
import type { ActionExecutorContext } from "../action-executor";

export async function blockAndFlagHandler(ctx: ActionExecutorContext, caseId: string): Promise<void> {
  // 1. Write fraud_flagged event to the immutable audit log
  await db.caseEvent.create({
    data: {
      caseId,
      actor:   "system",
      type:    "fraud_flagged",
      payload: {
        caseRef:          ctx.caseRef,
        riskLevel:        ctx.riskLevel,
        riskScore:        ctx.riskScore,
        evidenceStrength: ctx.evidenceStrength,
        triggeredRules:   ctx.triggeredRules,
      },
    },
  });

  // 2. Send fraud alert email to admin
  const to =
    ctx.adminEmail ??
    process.env.TRUSTSTACK_ADMIN_EMAIL;

  if (!to) {
    console.warn(`[TrustStack] block_and_flag: no admin email configured for case ${ctx.caseRef}. Set TRUSTSTACK_ADMIN_EMAIL.`);
    return;
  }

  const template = blockAndFlagTemplate(ctx);
  const id = await sendEmail({ to, ...template });
  if (id === null) {
    console.warn(`[TrustStack] block_and_flag: RESEND_API_KEY not set — alert email skipped for case ${ctx.caseRef}`);
  }
}
