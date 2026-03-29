import type { ClaimMetadata, PolicyDecision, Signal } from "@/lib/detection/types";
import { getSignalFlag, getSignalScore } from "@/lib/claim/consistency";

/**
 * Configurable thresholds for the policy engine.
 * All fields optional — DEFAULTS applied for any omitted value.
 */
export type PolicyConfig = {
  /** Image AI probability that triggers outright rejection (default 0.80) */
  imageAiRejectThreshold?: number;
  /** Image AI probability that triggers a flag for review (default 0.55) */
  imageAiFlagThreshold?: number;
  /** Text AI probability that triggers a flag (default 0.75) */
  textAiFlagThreshold?: number;
  /** Hours after incident before a claim is considered late (default 48) */
  lateFilingHours?: number;
  /** Account refund rate above which elevated fraud risk is flagged (default 0.40) */
  highRefundRateThreshold?: number;
  /** Whether high-value claims with no video proof should be flagged (default true) */
  requireVideoForHighValue?: boolean;
  /** Free-text policy notes passed verbatim to the LLM judge */
  customPolicyNotes?: string;
};

const DEFAULTS: Required<Omit<PolicyConfig, "customPolicyNotes">> = {
  imageAiRejectThreshold: 0.8,
  imageAiFlagThreshold: 0.55,
  textAiFlagThreshold: 0.75,
  lateFilingHours: 48,
  highRefundRateThreshold: 0.4,
  requireVideoForHighValue: true,
};

/**
 * Layer 3: Policy Engine.
 *
 * Consumes ONLY normalized signals and claim metadata — never raw media or
 * raw detection scores. Raw scores are read from Signal.score where needed
 * for threshold comparison, keeping the signal as the unit of exchange.
 *
 * Each rule produces an audit trail entry with full context (input values,
 * threshold used, outcome) so decisions are reproducible without re-analysis.
 */
export function applyPolicies(
  signals: Signal[],
  consistencyScore: number,
  meta: ClaimMetadata,
  config: PolicyConfig = {},
): { decision: PolicyDecision; auditTrail: string[] } {
  const cfg = { ...DEFAULTS, ...config };
  const trail: string[] = [];
  let decision: PolicyDecision = "approve";

  // ── Rule: image_ai_threshold ──────────────────────────────────────────────
  const imageScore = getSignalScore(signals, "image_authenticity") ?? 0;
  if (imageScore >= cfg.imageAiRejectThreshold) {
    decision = "reject";
    trail.push(
      `RULE image_ai_threshold_reject: image_authenticity.score=${pct(imageScore)} ≥ reject_threshold=${pct(cfg.imageAiRejectThreshold)} — evidence is likely fabricated.`,
    );
  } else if (imageScore >= cfg.imageAiFlagThreshold) {
    if (decision === "approve") decision = "flag";
    trail.push(
      `RULE image_ai_threshold_flag: image_authenticity.score=${pct(imageScore)} ≥ flag_threshold=${pct(cfg.imageAiFlagThreshold)} — evidence requires manual review.`,
    );
  }

  // ── Rule: text_ai_threshold ───────────────────────────────────────────────
  const textScore = getSignalScore(signals, "text_authenticity") ?? 0;
  if (textScore >= cfg.textAiFlagThreshold) {
    if (decision === "approve") decision = "flag";
    trail.push(
      `RULE text_ai_threshold_flag: text_authenticity.score=${pct(textScore)} ≥ flag_threshold=${pct(cfg.textAiFlagThreshold)} — claim may be machine-generated.`,
    );
  }

  // ── Rule: logistics_conflict ──────────────────────────────────────────────
  if (getSignalFlag(signals, "logistics_conflict") === "risk") {
    if (decision !== "reject") decision = "flag";
    trail.push(
      "RULE logistics_conflict: logistics_conflict.flag=risk — logistics data contradicts claim (delivery marked intact, damage claimed).",
    );
  }

  // ── Rule: late_filing ─────────────────────────────────────────────────────
  const claimAge = getSignalScore(signals, "claim_timeliness");
  if (claimAge !== undefined && claimAge > cfg.lateFilingHours) {
    if (decision === "approve") decision = "flag";
    trail.push(
      `RULE late_filing: claim_timeliness.score=${claimAge}h > late_filing_threshold=${cfg.lateFilingHours}h — filing outside policy window.`,
    );
  }

  // ── Rule: high_refund_risk ────────────────────────────────────────────────
  const refundRate = getSignalScore(signals, "refund_history");
  if (
    refundRate !== undefined &&
    refundRate >= cfg.highRefundRateThreshold &&
    consistencyScore >= 0.5
  ) {
    if (decision !== "reject") decision = "flag";
    trail.push(
      `RULE high_refund_risk: refund_history.score=${pct(refundRate)} ≥ threshold=${pct(cfg.highRefundRateThreshold)}, consistency_score=${pct(consistencyScore)} — elevated combined fraud risk.`,
    );
  }

  // ── Rule: high_value_video_required ──────────────────────────────────────
  if (
    cfg.requireVideoForHighValue &&
    getSignalFlag(signals, "evidence_quality") === "neutral" &&
    meta.highValue &&
    !meta.hasVideoProof
  ) {
    if (decision === "approve") decision = "flag";
    trail.push(
      "RULE high_value_video_required: evidence_quality.flag=neutral, high_value=true, has_video_proof=false — policy requires video for high-value claims.",
    );
  }

  // ── Rule: combined_high_risk ──────────────────────────────────────────────
  if (consistencyScore >= 0.75 && imageScore >= 0.65) {
    decision = "reject";
    trail.push(
      `RULE combined_high_risk: consistency_score=${pct(consistencyScore)} ≥ 75%, image_authenticity.score=${pct(imageScore)} ≥ 65% — combined signal warrants rejection.`,
    );
  }

  // ── Custom policy notes ───────────────────────────────────────────────────
  if (cfg.customPolicyNotes?.trim()) {
    trail.push(`CUSTOM_POLICY: ${cfg.customPolicyNotes.trim()}`);
  }

  // ── Default ───────────────────────────────────────────────────────────────
  if (trail.length === 0) {
    trail.push("RULE default_approve: No policy violations detected. Claim approved.");
  }

  return { decision, auditTrail: trail };
}

function pct(n: number): string {
  return n > 1 ? `${Math.round(n)}` : `${Math.round(n * 100)}%`;
}
