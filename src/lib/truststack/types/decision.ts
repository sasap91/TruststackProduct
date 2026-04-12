/**
 * TrustStack deterministic pipeline — decision and audit types.
 *
 * PipelineDecision and PipelineDecisionOutcome are pipeline-scoped types.
 * They are intentionally distinct from the orchestrator's DecisionOutcome
 * and PolicyDecision in types/policy.ts.
 */

import type { PipelineClaimInput, ClassifierOutput } from "./claim";
import type { VisualSignals, TextSignals, ConsistencySignals } from "./signals";

// ── Decision outcome ─────────────────────────────────────────────────────────

/**
 * The three possible outcomes from the pipeline policy engine.
 * There is no human gate — all three are final automated decisions.
 */
export type PipelineDecisionOutcome = "approve" | "approve_flagged" | "reject";

// ── Rule tracing ─────────────────────────────────────────────────────────────

export type RuleSeverity = "hard" | "fraud" | "eligibility" | "policy";

export interface TriggeredRule {
  /** Stable rule identifier in the format HARD_NNN, FRAUD_NNN, ELIG_NNN, POLICY_NNN */
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  outcome: PipelineDecisionOutcome;
  details: string;
}

// ── Policy decision ──────────────────────────────────────────────────────────

/**
 * The final output of the policy engine.
 * Produced by runPolicyEngine() in pipeline/policy-engine.ts.
 */
export interface PipelineDecision {
  claimId: string;
  outcome: PipelineDecisionOutcome;
  /**
   * Additive fraud score 0–100.
   * ≥ 60 → reject, ≥ 30 → approve_flagged, < 30 → approve
   * (unless a HARD or ELIG rule overrides the outcome first).
   */
  fraudScore: number;
  triggeredRules: TriggeredRule[];
  requiredActions: string[];
  /** ISO 8601 timestamp set by the policy engine */
  timestamp: string;
}

// ── Audit record ─────────────────────────────────────────────────────────────

/**
 * Immutable record written by audit.ts after every pipeline run.
 * Contains the full input, every signal output, and the final decision.
 */
export interface AuditRecord {
  claimId: string;
  input: PipelineClaimInput;
  classifierOutput: ClassifierOutput;
  visualSignals: VisualSignals;
  textSignals: TextSignals;
  consistencySignals: ConsistencySignals;
  decision: PipelineDecision;
  /** Wall-clock duration from pipeline entry to decision */
  pipelineDurationMs: number;
  modelVersions: {
    classifier: string;
    /** null when extract_visual() was skipped */
    visual: string | null;
    text: string;
    consistency: string;
  };
}

// ── Retailer rule overrides ───────────────────────────────────────────────────

/**
 * Per-retailer policy thresholds loaded by rules/retailer-rules.ts.
 * All fields have documented defaults; absent fields fall back to defaults.
 */
export interface RetailerRuleSet {
  retailerId: string;
  /** Days after order date within which a claim is eligible. Default: 30 */
  returnWindowDays: number;
  /** Maximum eligible claim value in minor currency units. Default: 50000 */
  maxClaimValueMinorUnits: number;
  /**
   * Order value above which POLICY_002 advisory fires.
   * Default: 20000 minor units.
   */
  policyValueThresholdMinorUnits: number;
  /** Rule IDs (e.g. "ELIG_002") to skip for this retailer */
  disabledRules: string[];
}
