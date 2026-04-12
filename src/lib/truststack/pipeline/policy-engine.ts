/**
 * TrustStack deterministic pipeline — policy engine.
 *
 * Pure synchronous function. No async, no LLM calls, no I/O, no randomness.
 * Identical inputs always produce identical outputs.
 *
 * Rule evaluation order:
 *   1. HARD rules  — short-circuit on first match → immediate reject
 *   2. ELIG rules  — all evaluated; any failure → reject
 *   3. FRAUD rules — all evaluated; additive fraudScore
 *   4. POLICY rules — all evaluated; contribute requiredActions
 *
 * Final outcome:
 *   any HARD or ELIG triggered  → reject
 *   fraudScore >= 60            → reject
 *   fraudScore >= 30            → approve_flagged
 *   otherwise                   → approve
 */

import { PipelineClaimType } from "../types/claim";
import type { PipelineClaimInput } from "../types/claim";
import type { MergedSignals } from "../types/signals";
import type {
  PipelineDecision,
  PipelineDecisionOutcome,
  TriggeredRule,
  RetailerRuleSet,
} from "../types/decision";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(Math.abs(new Date(isoB).getTime() - new Date(isoA).getTime()) / msPerDay);
}

function buildDecision(
  claimId: string,
  outcome: PipelineDecisionOutcome,
  fraudScore: number,
  triggeredRules: TriggeredRule[],
  requiredActions: string[],
): PipelineDecision {
  return {
    claimId,
    outcome,
    fraudScore,
    triggeredRules,
    requiredActions,
    timestamp: new Date().toISOString(),
  };
}

// ── Policy engine ─────────────────────────────────────────────────────────────

export function runPolicyEngine(
  input: PipelineClaimInput,
  signals: MergedSignals,
  retailerRules: RetailerRuleSet,
): PipelineDecision {
  const disabled = new Set(retailerRules.disabledRules);
  const skip = (id: string) => disabled.has(id);

  const triggered: TriggeredRule[] = [];
  const requiredActions: string[] = [];
  let fraudScore = 0;
  let hardOrEligRejected = false;

  function push(rule: TriggeredRule): void {
    triggered.push(rule);
    if (rule.severity === "hard" || rule.severity === "eligibility") {
      hardOrEligRejected = true;
    }
  }

  // ── HARD rules (short-circuit on first match) ─────────────────────────────

  if (
    !skip("HARD_001") &&
    !signals.visual.skipped &&
    signals.visual.aiGeneratedPhotoDetected
  ) {
    push({
      ruleId: "HARD_001",
      ruleName: "AI-Generated Photo Detected",
      severity: "hard",
      outcome: "reject",
      details: "AI-generated photo detected in evidence. Claim is fraudulent.",
    });
    return buildDecision(input.claimId, "reject", fraudScore, triggered, requiredActions);
  }

  if (!skip("HARD_002") && signals.consistency.score < 0.20) {
    push({
      ruleId: "HARD_002",
      ruleName: "Consistency Score Below Floor",
      severity: "hard",
      outcome: "reject",
      details: `Consistency score ${signals.consistency.score.toFixed(3)} is below the minimum threshold of 0.20. Narrative is incoherent.`,
    });
    return buildDecision(input.claimId, "reject", fraudScore, triggered, requiredActions);
  }

  // ── ELIG rules (all evaluated) ────────────────────────────────────────────

  const daysSinceOrder = daysBetween(input.orderDate, input.claimDate);

  if (!skip("ELIG_001") && daysSinceOrder > retailerRules.returnWindowDays) {
    push({
      ruleId: "ELIG_001",
      ruleName: "Return Window Exceeded",
      severity: "eligibility",
      outcome: "reject",
      details: `Claim filed ${daysSinceOrder} day(s) after order date; return window is ${retailerRules.returnWindowDays} days.`,
    });
  }

  if (!skip("ELIG_002") && input.orderValue > retailerRules.maxClaimValueMinorUnits) {
    push({
      ruleId: "ELIG_002",
      ruleName: "Value Limit Exceeded",
      severity: "eligibility",
      outcome: "reject",
      details: `Order value ${input.orderValue} exceeds the retailer maximum of ${retailerRules.maxClaimValueMinorUnits} minor units.`,
    });
  }

  if (!skip("ELIG_003") && signals.classifier.confidence < 0.40) {
    push({
      ruleId: "ELIG_003",
      ruleName: "Classifier Confidence Too Low",
      severity: "eligibility",
      outcome: "reject",
      details: `Classifier confidence ${signals.classifier.confidence.toFixed(3)} is below the minimum of 0.40. Claim requires manual triage.`,
    });
  }

  if (
    !skip("ELIG_004") &&
    input.declaredClaimType !== undefined &&
    input.declaredClaimType !== signals.classifier.claimType
  ) {
    push({
      ruleId: "ELIG_004",
      ruleName: "Claim Type Mismatch",
      severity: "eligibility",
      outcome: "reject",
      details: `Declared type "${input.declaredClaimType}" does not match classifier output "${signals.classifier.claimType}".`,
    });
  }

  // ── FRAUD rules (additive score) ──────────────────────────────────────────

  if (!skip("FRAUD_001") && signals.text.timelineAnomaly) {
    fraudScore += 25;
    push({
      ruleId: "FRAUD_001",
      ruleName: "Timeline Anomaly",
      severity: "fraud",
      outcome: "reject", // resolved against final score below
      details: "Claim timeline contains anomalies inconsistent with the reported event. (+25)",
    });
  }

  if (!skip("FRAUD_002") && signals.text.highValueLanguage) {
    fraudScore += 15;
    push({
      ruleId: "FRAUD_002",
      ruleName: "High-Value Language",
      severity: "fraud",
      outcome: "approve_flagged",
      details: "Language pattern associated with coached or escalated fraud claims. (+15)",
    });
  }

  if (!skip("FRAUD_003") && signals.consistency.crossSignalConflicts.length > 0) {
    const n = signals.consistency.crossSignalConflicts.length;
    const addition = Math.min(n * 20, 40);
    fraudScore += addition;
    push({
      ruleId: "FRAUD_003",
      ruleName: "Cross-Signal Conflicts",
      severity: "fraud",
      outcome: "approve_flagged",
      details: `${n} cross-signal conflict(s) detected. (+${addition}, cap 40)`,
    });
  }

  if (
    !skip("FRAUD_004") &&
    !signals.visual.skipped &&
    signals.visual.photoMatchesDescription === false
  ) {
    fraudScore += 30;
    push({
      ruleId: "FRAUD_004",
      ruleName: "Photo Does Not Match Description",
      severity: "fraud",
      outcome: "reject",
      details: "Submitted photos do not match the claimed product or damage. (+30)",
    });
  }

  if (
    !skip("FRAUD_005") &&
    !signals.visual.skipped &&
    signals.visual.suspiciousElements.length > 0
  ) {
    fraudScore += 20;
    push({
      ruleId: "FRAUD_005",
      ruleName: "Suspicious Visual Elements",
      severity: "fraud",
      outcome: "approve_flagged",
      details: `Visual analysis flagged ${signals.visual.suspiciousElements.length} suspicious element(s). (+20)`,
    });
  }

  // ── POLICY rules ──────────────────────────────────────────────────────────

  if (
    !skip("POLICY_001") &&
    daysSinceOrder > 14 &&
    daysSinceOrder <= retailerRules.returnWindowDays
  ) {
    requiredActions.push("verify_return_window");
    push({
      ruleId: "POLICY_001",
      ruleName: "Return Window Advisory",
      severity: "policy",
      outcome: "approve",
      details: `Claim filed ${daysSinceOrder} day(s) after order — approaching return window close (${retailerRules.returnWindowDays} days).`,
    });
  }

  if (!skip("POLICY_002") && input.orderValue > retailerRules.policyValueThresholdMinorUnits) {
    requiredActions.push("escalate_value_review");
    push({
      ruleId: "POLICY_002",
      ruleName: "High-Value Claim Advisory",
      severity: "policy",
      outcome: "approve_flagged",
      details: `Order value ${input.orderValue} exceeds the advisory threshold of ${retailerRules.policyValueThresholdMinorUnits} minor units.`,
    });
  }

  // ── Final outcome ─────────────────────────────────────────────────────────

  let outcome: PipelineDecisionOutcome;
  if (hardOrEligRejected || fraudScore >= 60) {
    outcome = "reject";
  } else if (fraudScore >= 30) {
    outcome = "approve_flagged";
  } else {
    outcome = "approve";
  }

  // Back-fill fraud rule outcomes with the final decision so audit traces are accurate.
  for (const rule of triggered) {
    if (rule.severity === "fraud") {
      rule.outcome = outcome;
    }
  }

  return buildDecision(input.claimId, outcome, fraudScore, triggered, requiredActions);
}

// Re-export PipelineClaimType so consumers only need one import.
export { PipelineClaimType };
