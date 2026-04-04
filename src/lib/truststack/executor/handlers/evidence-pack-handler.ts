import { db } from "@/lib/db";
import type { ActionExecutorContext } from "../action-executor";

/**
 * Bundles the full decision context into a structured CaseEvent payload.
 * Retrievable by querying CaseEvent where type = "evidence_pack_generated".
 * No email — this is an internal audit artifact.
 */
export async function evidencePackHandler(ctx: ActionExecutorContext, caseId: string): Promise<void> {
  await db.caseEvent.create({
    data: {
      caseId,
      actor:   "system",
      type:    "evidence_pack_generated",
      payload: {
        caseRef:           ctx.caseRef,
        outcome:           ctx.outcome,
        riskLevel:         ctx.riskLevel,
        riskScore:         ctx.riskScore,
        evidenceStrength:  ctx.evidenceStrength,
        modalitiesCovered: ctx.modalitiesCovered,
        triggeredRules:    ctx.triggeredRules,
        evidenceReferences: ctx.evidenceReferences,
        contradictions:    ctx.contradictions,
        generatedAt:       new Date().toISOString(),
      },
    },
  });
}
