/**
 * TrustStack deterministic pipeline — base rule definitions.
 *
 * Exports stable metadata for every rule in the pipeline. Rule IDs in this
 * file are the single source of truth — never renumber existing entries.
 *
 * The policy engine (pipeline/policy-engine.ts) contains the evaluation logic;
 * this file holds the descriptive catalogue used by audit output, API
 * responses, and the rule reference in CLAUDE.md.
 */

import type { RuleSeverity } from "../types/decision";

// ── Rule catalogue type ─────���─────────────────────────────────────────────────

export interface RuleDefinition {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  description: string;
  /** Score added to fraudScore when this rule triggers (FRAUD rules only). */
  fraudWeight?: number;
}

// ── HARD rules ─────────���──────────────────────────────────────────────────────

export const HARD_RULES: readonly RuleDefinition[] = [
  {
    ruleId:      "HARD_001",
    ruleName:    "AI-Generated Photo Detected",
    severity:    "hard",
    description: "Triggers when extract_visual() detects that at least one submitted photo is AI-generated. Short-circuits evaluation immediately and returns reject.",
  },
  {
    ruleId:      "HARD_002",
    ruleName:    "Consistency Score Below Floor",
    severity:    "hard",
    description: "Triggers when check_consistency() returns a score below 0.20. Indicates a fundamentally incoherent narrative. Short-circuits immediately and returns reject.",
  },
] as const;

// ── FRAUD rules ─────��────────────────────────────────��────────────────────────

export const FRAUD_RULES: readonly RuleDefinition[] = [
  {
    ruleId:      "FRAUD_001",
    ruleName:    "Timeline Anomaly",
    severity:    "fraud",
    fraudWeight: 25,
    description: "Triggers when extract_text() detects timeline anomalies: dates or event sequences that are internally inconsistent with the reported incident.",
  },
  {
    ruleId:      "FRAUD_002",
    ruleName:    "High-Value Language",
    severity:    "fraud",
    fraudWeight: 15,
    description: "Triggers when extract_text() detects language patterns associated with coached or escalated fraud claims (legal threats, formal demand language, unusual urgency).",
  },
  {
    ruleId:      "FRAUD_003",
    ruleName:    "Cross-Signal Conflicts",
    severity:    "fraud",
    fraudWeight: 20, // per conflict, capped at 40
    description: "Triggers when check_consistency() finds conflicts between visual signals, text signals, and classifier output. +20 per conflict, maximum +40 total.",
  },
  {
    ruleId:      "FRAUD_004",
    ruleName:    "Photo Does Not Match Description",
    severity:    "fraud",
    fraudWeight: 30,
    description: "Triggers when extract_visual() determines that submitted photos do not match the claimed product or described damage.",
  },
  {
    ruleId:      "FRAUD_005",
    ruleName:    "Suspicious Visual Elements",
    severity:    "fraud",
    fraudWeight: 20,
    description: "Triggers when extract_visual() flags suspicious elements in submitted photos (staged scenes, mismatched lighting, anomalous backgrounds, etc.).",
  },
] as const;

// ── ELIG rules ────────────────────────────────────────────────────────────────

export const ELIG_RULES: readonly RuleDefinition[] = [
  {
    ruleId:      "ELIG_001",
    ruleName:    "Return Window Exceeded",
    severity:    "eligibility",
    description: "Triggers when the number of days between orderDate and claimDate exceeds the retailer's returnWindowDays (default 30).",
  },
  {
    ruleId:      "ELIG_002",
    ruleName:    "Value Limit Exceeded",
    severity:    "eligibility",
    description: "Triggers when orderValue exceeds the retailer's maxClaimValueMinorUnits (default 50000 minor currency units).",
  },
  {
    ruleId:      "ELIG_003",
    ruleName:    "Classifier Confidence Too Low",
    severity:    "eligibility",
    description: "Triggers when classify_claim() returns a confidence below 0.40. The claim cannot be reliably categorised and requires manual triage.",
  },
  {
    ruleId:      "ELIG_004",
    ruleName:    "Claim Type Mismatch",
    severity:    "eligibility",
    description: "Triggers when input.declaredClaimType is present and differs from the classifier's claimType output.",
  },
] as const;

// ── POLICY rules ───────��──────────────────────────���───────────────────────────

export const POLICY_RULES: readonly RuleDefinition[] = [
  {
    ruleId:      "POLICY_001",
    ruleName:    "Return Window Advisory",
    severity:    "policy",
    description: "Fires when a claim is filed more than 14 days but within the retailer's return window. Adds 'verify_return_window' to requiredActions.",
  },
  {
    ruleId:      "POLICY_002",
    ruleName:    "High-Value Claim Advisory",
    severity:    "policy",
    description: "Fires when orderValue exceeds the retailer's policyValueThresholdMinorUnits (default 20000). Adds 'escalate_value_review' to requiredActions.",
  },
] as const;

// ── Combined catalogue ────────────────────────────────────────────────────────

export const ALL_RULES: readonly RuleDefinition[] = [
  ...HARD_RULES,
  ...FRAUD_RULES,
  ...ELIG_RULES,
  ...POLICY_RULES,
] as const;

/** Look up a rule definition by ID. Returns undefined if not found. */
export function getRuleDefinition(ruleId: string): RuleDefinition | undefined {
  return ALL_RULES.find((r) => r.ruleId === ruleId);
}
