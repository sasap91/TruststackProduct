/**
 * PolicyDecision — the output of the policy engine (Layer 3).
 *
 * The policy engine consumes only NormalizedSignals and produces a structured
 * decision with full rule traceability. It never sees raw media or raw scores.
 */

export type DecisionOutcome =
  | "approve"
  | "review"                  // escalate to human reviewer
  | "request_more_evidence"   // ask claimant for additional proof
  | "reject"
  | "flag";                   // legacy alias for "review" — kept for compatibility

export type PolicyRuleMatch = {
  /** Stable rule identifier, e.g. "image_ai_threshold_reject" */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  /** Whether the rule condition evaluated to true */
  triggered: boolean;
  /** All input values used in the rule evaluation (for full audit reproducibility) */
  inputValues: Record<string, unknown>;
  /** The outcome contribution of this rule: only meaningful when triggered=true */
  outcome: DecisionOutcome | "no_op";
  /** Human-readable explanation of the rule evaluation */
  detail: string;
};

/** Optional structured hints from PolicyReasoningProvider (audit / future rules) */
export type PolicyReasoningHint = {
  code: string;
  severity: "info" | "watch";
  detail: string;
};

export type PolicyDecision = {
  outcome: DecisionOutcome;
  /** Human-readable combined explanation (populated by LLM judge or template) */
  explanation: string;
  /** All rules evaluated, including those that did NOT trigger */
  matchedRules: PolicyRuleMatch[];
  /** Signal keys that were the primary drivers of this decision */
  evidenceReferences: string[];
  /** Overall policy confidence (0–1), derived from signal confidences */
  confidence: number;
  decidedAt: Date;
  /** Optional version tag for the policy configuration used */
  policyVersion?: string;
  /** Supplemental reasoning metadata when a PolicyReasoningProvider is wired */
  policyReasoningMeta?: {
    providerId: string;
    confidence: number;
    hints: PolicyReasoningHint[];
  };
};

/**
 * PolicyConfig — merchant-configurable thresholds and behaviour.
 * All fields optional; DEFAULTS apply for any omitted field.
 */
export type PolicyConfig = {
  // ── Legacy signal-score thresholds (used by old policy-engine) ──────────────
  imageAiRejectThreshold?: number;    // default 0.80
  imageAiFlagThreshold?: number;      // default 0.55
  textAiFlagThreshold?: number;       // default 0.75

  // ── Risk-band auto-routing (used by PolicyAgent) ───────────────────────────
  /** Risk score below this → auto-approve without further rule evaluation (default 0.10) */
  autoApproveBelow?: number;
  /** Risk score above this → auto-reject without further rule evaluation (default 0.88) */
  autoRejectAbove?: number;

  // ── Shared thresholds ─────────────────────────────────────────────────────
  lateFilingHours?: number;           // default 48
  highRefundRateThreshold?: number;   // default 0.40
  requireVideoForHighValue?: boolean; // default true

  // ── Retailer policy pack ───────────────────────────────────────────────────
  /**
   * Named policy pack to load.
   * Built-in: "standard" (default) | "strict" | "lenient"
   * Use for retailer-specific behaviour without modifying base rules.
   */
  policyPackId?: "standard" | "strict" | "lenient" | string;

  /** Free-text notes passed verbatim to the LLM judge */
  customPolicyNotes?: string;

  // ── Iterative evidence loop ───────────────────────────────────────────────
  /**
   * How long (hours) to wait for re-submitted evidence before auto-rejecting.
   * Default 72h. After this window, a pending "awaiting_evidence" case is
   * rejected rather than re-queued.
   */
  evidenceTimeoutHours?: number;
};
