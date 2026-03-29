/**
 * Optional: persist OutcomeFeedback payloads to Postgres via Prisma.
 * Call once at app startup (e.g. instrumentation.ts or layout server init):
 *   import { attachPrismaOutcomeFeedbackSink } from "@/lib/outcome-feedback-prisma-sink";
 *   attachPrismaOutcomeFeedbackSink();
 */

import { db } from "@/lib/db";
import {
  registerOutcomeFeedbackSink,
  type OutcomeFeedbackPayload,
} from "@/lib/truststack/eval/feedback";

export function attachPrismaOutcomeFeedbackSink(): () => void {
  return registerOutcomeFeedbackSink(async (p: OutcomeFeedbackPayload) => {
    await db.outcomeFeedback.create({
      data: {
        caseId:          p.caseId,
        decisionRunId: p.decisionRunId ?? null,
        kind:            p.kind,
        pipelineOutcome: p.pipelineOutcome ?? null,
        finalOutcome:    p.finalOutcome ?? null,
        chargebackWon:   p.chargebackWon ?? null,
        amountUsd:       p.amountUsd ?? null,
        notes:           p.notes ?? null,
        recordedBy:      p.recordedBy ?? null,
        metadata:        p.metadata as object | undefined,
      },
    });
  });
}
