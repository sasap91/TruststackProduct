/**
 * PolicyEngine
 *
 * Evaluates a RiskAssessment against merchant-configurable policy rules and
 * produces a PolicyDecision with full rule traceability.
 *
 * The engine operates ONLY on NormalizedSignals from the RiskAssessment.
 * It never reads raw scores, raw media, or artifact-level data directly.
 */

import type { Agent } from "./index";
import type { NormalizedSignal } from "../types/signal";
import type { RiskAssessment } from "../types/risk";
import type {
  PolicyConfig,
  PolicyDecision,
  PolicyRuleMatch,
  DecisionOutcome,
} from "../types/policy";

export type PolicyEngineInput = {
  risk: RiskAssessment;
  config?: PolicyConfig;
};

export type PolicyEngineOutput = PolicyDecision;

const DEFAULTS: Required<Omit<PolicyConfig, "customPolicyNotes" | "policyPackId">> = {
  imageAiRejectThreshold:  0.80,
  imageAiFlagThreshold:    0.55,
  textAiFlagThreshold:     0.75,
  autoApproveBelow:        0.10,
  autoRejectAbove:         0.88,
  lateFilingHours:         48,
  highRefundRateThreshold: 0.40,
  requireVideoForHighValue: true,
  evidenceTimeoutHours:    72,
};

export class PolicyEngine implements Agent<PolicyEngineInput, PolicyEngineOutput> {
  readonly agentId = "policy-engine";
  readonly version = "1.0.0";

  async run(input: PolicyEngineInput): Promise<PolicyEngineOutput> {
    const { risk, config = {} } = input;
    const cfg = { ...DEFAULTS, ...config };
    const { signals, consistencyScore } = risk;

    const rules: PolicyRuleMatch[] = [];
    let outcome: DecisionOutcome = "approve";
    const evidenceRefs: string[] = [];

    // Helper: look up a signal's rawScore by key
    const score = (key: string) =>
      signals.find((s) => s.key === key)?.rawScore;
    const flag = (key: string) =>
      signals.find((s) => s.key === key)?.flag;

    const imageScore = score("image_authenticity") ?? 0;
    const textScore  = score("text_authenticity")  ?? 0;
    const claimAge   = score("claim_timeliness");
    const refundRate = score("refund_history");

    // ── Rule 1: image_ai_threshold_reject ─────────────────────────────────
    const r1triggered = imageScore >= cfg.imageAiRejectThreshold;
    rules.push({
      ruleId: "image_ai_threshold_reject",
      ruleName: "Image AI — reject threshold",
      triggered: r1triggered,
      inputValues: { imageScore, threshold: cfg.imageAiRejectThreshold },
      outcome: r1triggered ? "reject" : "no_op",
      detail: r1triggered
        ? `image_authenticity.rawScore=${pct(imageScore)} ≥ reject_threshold=${pct(cfg.imageAiRejectThreshold)} — evidence likely fabricated.`
        : `image_authenticity.rawScore=${pct(imageScore)} < reject_threshold=${pct(cfg.imageAiRejectThreshold)} — did not trigger.`,
    });
    if (r1triggered) {
      outcome = "reject";
      evidenceRefs.push("image_authenticity");
    }

    // ── Rule 2: image_ai_threshold_flag ───────────────────────────────────
    const r2triggered = !r1triggered && imageScore >= cfg.imageAiFlagThreshold;
    rules.push({
      ruleId: "image_ai_threshold_flag",
      ruleName: "Image AI — flag threshold",
      triggered: r2triggered,
      inputValues: { imageScore, threshold: cfg.imageAiFlagThreshold },
      outcome: r2triggered ? "flag" : "no_op",
      detail: r2triggered
        ? `image_authenticity.rawScore=${pct(imageScore)} ≥ flag_threshold=${pct(cfg.imageAiFlagThreshold)} — evidence requires review.`
        : `image_authenticity.rawScore=${pct(imageScore)} < flag_threshold=${pct(cfg.imageAiFlagThreshold)} — did not trigger.`,
    });
    if (r2triggered && outcome === "approve") {
      outcome = "flag";
      evidenceRefs.push("image_authenticity");
    }

    // ── Rule 3: text_ai_threshold_flag ────────────────────────────────────
    const r3triggered = textScore >= cfg.textAiFlagThreshold;
    rules.push({
      ruleId: "text_ai_threshold_flag",
      ruleName: "Text AI — flag threshold",
      triggered: r3triggered,
      inputValues: { textScore, threshold: cfg.textAiFlagThreshold },
      outcome: r3triggered ? "flag" : "no_op",
      detail: r3triggered
        ? `text_authenticity.rawScore=${pct(textScore)} ≥ flag_threshold=${pct(cfg.textAiFlagThreshold)} — claim may be machine-generated.`
        : `text_authenticity.rawScore=${pct(textScore)} < flag_threshold=${pct(cfg.textAiFlagThreshold)} — did not trigger.`,
    });
    if (r3triggered && outcome === "approve") {
      outcome = "flag";
      evidenceRefs.push("text_authenticity");
    }

    // ── Rule 4: logistics_conflict ────────────────────────────────────────
    const r4triggered = flag("logistics_conflict") === "risk";
    rules.push({
      ruleId: "logistics_conflict",
      ruleName: "Logistics contradiction",
      triggered: r4triggered,
      inputValues: { logisticsFlag: flag("logistics_conflict") ?? "absent" },
      outcome: r4triggered ? "flag" : "no_op",
      detail: r4triggered
        ? "logistics_conflict.flag=risk — delivery marked intact while damage is claimed."
        : "No logistics contradiction signal present.",
    });
    if (r4triggered && outcome !== "reject") {
      outcome = "flag";
      evidenceRefs.push("logistics_conflict");
    }

    // ── Rule 5: late_filing ───────────────────────────────────────────────
    const r5triggered = claimAge !== undefined && claimAge > cfg.lateFilingHours;
    rules.push({
      ruleId: "late_filing",
      ruleName: "Late filing",
      triggered: r5triggered,
      inputValues: { claimAge: claimAge ?? "absent", threshold: cfg.lateFilingHours },
      outcome: r5triggered ? "flag" : "no_op",
      detail: r5triggered
        ? `claim_timeliness.rawScore=${claimAge}h > late_filing_threshold=${cfg.lateFilingHours}h.`
        : "Claim filed within policy window.",
    });
    if (r5triggered && outcome === "approve") {
      outcome = "flag";
      evidenceRefs.push("claim_timeliness");
    }

    // ── Rule 6: high_refund_risk ──────────────────────────────────────────
    const r6triggered =
      refundRate !== undefined &&
      refundRate >= cfg.highRefundRateThreshold &&
      consistencyScore >= 0.5;
    rules.push({
      ruleId: "high_refund_risk",
      ruleName: "High refund rate + inconsistency",
      triggered: r6triggered,
      inputValues: {
        refundRate: refundRate ?? "absent",
        threshold: cfg.highRefundRateThreshold,
        consistencyScore,
      },
      outcome: r6triggered ? "flag" : "no_op",
      detail: r6triggered
        ? `refund_history.rawScore=${pct(refundRate!)} ≥ threshold=${pct(cfg.highRefundRateThreshold)}, consistency_score=${pct(consistencyScore)} — elevated combined risk.`
        : "Refund rate or consistency score below threshold.",
    });
    if (r6triggered && outcome !== "reject") {
      outcome = "flag";
      evidenceRefs.push("refund_history");
    }

    // ── Rule 7: high_value_video_required ─────────────────────────────────
    const r7triggered =
      cfg.requireVideoForHighValue &&
      flag("evidence_quality") === "neutral";
    rules.push({
      ruleId: "high_value_video_required",
      ruleName: "High-value video requirement",
      triggered: r7triggered,
      inputValues: {
        evidenceQualityFlag: flag("evidence_quality") ?? "absent",
        requireVideoForHighValue: cfg.requireVideoForHighValue,
      },
      outcome: r7triggered ? "flag" : "no_op",
      detail: r7triggered
        ? "evidence_quality.flag=neutral — high-value claim without video proof."
        : "Video requirement not applicable or satisfied.",
    });
    if (r7triggered && outcome === "approve") {
      outcome = "flag";
      evidenceRefs.push("evidence_quality");
    }

    // ── Rule 8: combined_high_risk ────────────────────────────────────────
    const r8triggered = consistencyScore >= 0.75 && imageScore >= 0.65;
    rules.push({
      ruleId: "combined_high_risk",
      ruleName: "Combined high-risk signals",
      triggered: r8triggered,
      inputValues: { consistencyScore, imageScore },
      outcome: r8triggered ? "reject" : "no_op",
      detail: r8triggered
        ? `consistency_score=${pct(consistencyScore)} ≥ 75%, image_authenticity.rawScore=${pct(imageScore)} ≥ 65% — combined signal warrants rejection.`
        : "Combined risk threshold not met.",
    });
    if (r8triggered) {
      outcome = "reject";
      evidenceRefs.push("image_authenticity");
    }

    // Compute overall confidence from signal confidences
    const relevantSignals = signals.filter((s) =>
      evidenceRefs.includes(s.key),
    );
    const confidence =
      relevantSignals.length > 0
        ? relevantSignals.reduce((sum, s) => sum + s.confidence, 0) /
          relevantSignals.length
        : outcome === "approve" ? 0.8 : 0.5;

    return {
      outcome,
      explanation: "", // populated by JudgeAgent
      matchedRules: rules,
      evidenceReferences: [...new Set(evidenceRefs)],
      confidence,
      decidedAt: new Date(),
    };
  }
}

function pct(n: number): string {
  return n > 1 ? `${Math.round(n)}` : `${Math.round(n * 100)}%`;
}

export const policyEngine = new PolicyEngine();
