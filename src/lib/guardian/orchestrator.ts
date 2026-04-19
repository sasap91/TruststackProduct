import { randomUUID } from "crypto";
import type { GuardianInput, GuardianAuditRecord, ScreenerOutput, ExtractorOutput, DecisionOutput } from "./types";
import { HARD_BLOCKED_TERMS } from "./ip-blocklist";
import { screenInput } from "./screener";
import { extractSignals } from "./extractor";
import { makeDecision } from "./decision";
import { suggestAlternativePrompts } from "./suggest";
import { writeAuditRecord } from "./audit";

async function buildBlockedAuditRecord(
  requestId: string,
  startMs: number,
  input: GuardianInput,
  screenerOutput: ScreenerOutput,
  decisionOutput: DecisionOutput
): Promise<GuardianAuditRecord> {
  // Fetch suggestions if not already populated (uses 1 extra LLM call, stays within 3-call budget)
  if (decisionOutput.suggestedPrompts?.length === 0 && input.textPrompt) {
    decisionOutput.suggestedPrompts = await suggestAlternativePrompts(
      input.textPrompt,
      decisionOutput.reasoning
    );
  }

  return {
    requestId,
    timestamp: new Date().toISOString(),
    mode: input.mode,
    originalPrompt: input.textPrompt ?? null,
    injectionBlocked: false,
    injectionAttackType: null,
    injectionDescription: null,
    injectionMatchedText: null,
    promptWasRepaired: false,
    repairedPrompt: null,
    repairChanges: [],
    screenerVerdict: screenerOutput.verdict,
    screenerRiskScore: screenerOutput.riskScore,
    extractorOutput: null,
    decisionOutput,
    finalVerdict: "blocked",
    safeToPublish: false,
    durationMs: Date.now() - startMs,
  };
}

export async function runGuardianPipeline(input: GuardianInput): Promise<GuardianAuditRecord> {
  const startMs = Date.now();
  const requestId = randomUUID();

  // Step 1: synchronous keyword pre-screen (no LLM)
  const lowerPrompt = (input.textPrompt ?? "").toLowerCase();
  const matchedTerm = HARD_BLOCKED_TERMS.find((term) => lowerPrompt.includes(term));
  if (matchedTerm) {
    const screenerOutput: ScreenerOutput = {
      verdict: "hard_block",
      hardViolations: [{ term: matchedTerm, ipHolder: "Protected IP holder", reason: `Blocked term: "${matchedTerm}"` }],
      softViolations: [],
      repairedPrompt: null,
      riskScore: 1.0,
      explanation: `Hard-blocked term detected: "${matchedTerm}"`,
    };
    const decisionOutput: DecisionOutput = {
      verdict: "blocked",
      confidence: 1.0,
      rulesFired: [{ ruleId: "BLOCKLIST_MATCH", ruleName: "IP Blocklist Match", triggeredBy: matchedTerm, severity: "hard" }],
      violations: [{ type: "ip_character", description: `Blocked term: ${matchedTerm}`, severity: "hard", confidence: 1.0 }],
      safeToPublish: false,
      reasoning: `The input contains "${matchedTerm}", which is protected intellectual property. Using this character or brand in generated imagery without a licence constitutes IP infringement and exposes your organisation to legal liability.`,
      recommendedAction: "Remove all references to protected IP and use the suggested alternatives below.",
      suggestedPrompts: [],
    };
    const record = await buildBlockedAuditRecord(requestId, startMs, input, screenerOutput, decisionOutput);
    await writeAuditRecord(record);
    return record;
  }

  // Step 2: LLM Call 1 — screener
  const screenerOutput = await screenInput(input);

  if (screenerOutput.verdict === "hard_block") {
    const decisionOutput: DecisionOutput = {
      verdict: "blocked",
      confidence: 1.0,
      rulesFired: [{ ruleId: "SCREENER_HARD_BLOCK", ruleName: "Screener Hard Block", triggeredBy: screenerOutput.explanation, severity: "hard" }],
      violations: screenerOutput.hardViolations.map((v) => ({
        type: "ip_character" as const,
        description: v.reason,
        severity: "hard" as const,
        confidence: 1.0,
      })),
      safeToPublish: false,
      reasoning: screenerOutput.explanation,
      recommendedAction: "Remove all identified IP references and use the suggested alternatives below.",
      suggestedPrompts: [],
    };
    const record = await buildBlockedAuditRecord(requestId, startMs, input, screenerOutput, decisionOutput);
    await writeAuditRecord(record);
    return record;
  }

  if (screenerOutput.verdict === "soft_violation" && screenerOutput.repairedPrompt === null) {
    const decisionOutput: DecisionOutput = {
      verdict: "blocked",
      confidence: 0.9,
      rulesFired: [{ ruleId: "UNREPAIRABLE_SOFT_VIOLATION", ruleName: "Unrepairable Soft Violation", triggeredBy: screenerOutput.explanation, severity: "hard" }],
      violations: screenerOutput.softViolations.map((v) => ({
        type: "ip_character" as const,
        description: v.concern,
        severity: "hard" as const,
        confidence: screenerOutput.riskScore,
      })),
      safeToPublish: false,
      reasoning: `The prompt contains IP-adjacent content that cannot be repaired while preserving creative intent. ${screenerOutput.explanation}`,
      recommendedAction: "Rework the creative brief using the suggested alternatives below.",
      suggestedPrompts: [],
    };
    const record = await buildBlockedAuditRecord(requestId, startMs, input, screenerOutput, decisionOutput);
    await writeAuditRecord(record);
    return record;
  }

  // Step 3: LLM Call 2 — extractor
  const extractorOutput: ExtractorOutput = await extractSignals(input, screenerOutput);

  // Step 4: LLM Call 3 — decision
  const decisionOutput = await makeDecision(input, screenerOutput, extractorOutput);

  const promptWasRepaired = screenerOutput.repairedPrompt !== null;

  const record: GuardianAuditRecord = {
    requestId,
    timestamp: new Date().toISOString(),
    mode: input.mode,
    originalPrompt: input.textPrompt ?? null,
    injectionBlocked: false,
    injectionAttackType: null,
    injectionDescription: null,
    injectionMatchedText: null,
    promptWasRepaired,
    repairedPrompt: screenerOutput.repairedPrompt,
    repairChanges: promptWasRepaired
      ? [`Original: ${input.textPrompt}`, `Repaired: ${screenerOutput.repairedPrompt}`]
      : [],
    screenerVerdict: screenerOutput.verdict,
    screenerRiskScore: screenerOutput.riskScore,
    extractorOutput,
    decisionOutput,
    finalVerdict: decisionOutput.verdict,
    safeToPublish: decisionOutput.safeToPublish,
    durationMs: Date.now() - startMs,
  };

  await writeAuditRecord(record);
  return record;
}
