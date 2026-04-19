import { db } from "@/lib/db";
import type { GuardianAuditRecord } from "./types";

export async function writeAuditRecord(record: GuardianAuditRecord): Promise<void> {
  await (db as any).guardianCheck.create({
    data: {
      requestId: record.requestId,
      mode: record.mode,
      originalPrompt: record.originalPrompt,
      promptWasRepaired: record.promptWasRepaired,
      repairedPrompt: record.repairedPrompt,
      repairChanges: JSON.stringify(record.repairChanges),
      screenerVerdict: record.screenerVerdict,
      screenerRiskScore: record.screenerRiskScore,
      extractorOutput: record.extractorOutput ? JSON.stringify(record.extractorOutput) : null,
      decisionOutput: JSON.stringify(record.decisionOutput),
      finalVerdict: record.finalVerdict,
      safeToPublish: record.safeToPublish,
      durationMs: record.durationMs,
      violations: JSON.stringify(record.decisionOutput.violations),
      rulesFired: JSON.stringify(record.decisionOutput.rulesFired),
    },
  });
}
