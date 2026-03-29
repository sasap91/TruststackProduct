/**
 * ActionAgent
 *
 * Maps a PolicyDecision to a bounded, executable ActionExecution list.
 *
 * Design constraints:
 *   - Actions are BOUNDED — no unbounded side effects (no direct DB writes,
 *     no external API calls). Callers execute the returned actions.
 *   - Every action carries a full auditMessage for the case event log.
 *   - Multiple actions may be returned per decision (primary + secondary).
 *   - Action routing is deterministic: given the same PolicyDecision, the
 *     same ActionExecution list is always produced.
 *
 * ── Decision → Action routing ─────────────────────────────────────────────────
 *
 *   approve
 *     → auto_refund           (primary)
 *
 *   request_more_evidence
 *     → request_more_evidence (primary)
 *
 *   review  (or legacy flag)
 *     → send_to_human_review  (primary)
 *     + generate_evidence_pack (if evidenceStrength is weak/insufficient)
 *
 *   reject
 *     → auto_reject           (primary)
 *     + block_and_flag        (if riskLevel is high/critical OR repeat fraud signals)
 *     + generate_evidence_pack (if block_and_flag also triggered)
 */

import { randomUUID } from "crypto";
import type { Agent } from "./index";
import type { PolicyDecision } from "../types/policy";
import type { ActionExecution, ActionType } from "../types/action";
import type { RiskAssessment } from "../types/risk";
import type { SignalFusionResult } from "../types/fusion";

export type ActionAgentInput = {
  caseId:         string;
  decision:       PolicyDecision;
  riskAssessment: RiskAssessment;
  fusionResult:   SignalFusionResult;
};

export type ActionAgentOutput = {
  actions: ActionExecution[];
};

// ── Signal keys that indicate serious fraud (trigger block_and_flag) ──────────
const FRAUD_SIGNAL_KEYS = new Set([
  "possible_image_manipulation",
  "delivered_but_claimed_missing",
  "repeat_claimant",
  "suspicious_language",
]);

function hasFraudSignals(decision: PolicyDecision): boolean {
  return decision.evidenceReferences.some((ref) => FRAUD_SIGNAL_KEYS.has(ref));
}

// ── Action builder ────────────────────────────────────────────────────────────

function action(
  runId: string,
  caseId: string,
  actionType: ActionType,
  targetSystem: string,
  auditMessage: string,
  payload?: unknown,
): ActionExecution {
  const now = new Date();
  return {
    id:           `${runId}-${actionType}`,
    caseId,
    action:       actionType,
    status:       "completed",
    targetSystem,
    payload,
    executedAt:   now,
    completedAt:  now,
    auditMessage,
  };
}

// ── ActionAgent ───────────────────────────────────────────────────────────────

export class ActionAgent implements Agent<ActionAgentInput, ActionAgentOutput> {
  readonly agentId = "action-agent";
  readonly version = "1.0.0";

  async run(input: ActionAgentInput): Promise<ActionAgentOutput> {
    const { caseId, decision, riskAssessment, fusionResult } = input;
    const runId   = randomUUID();
    const actions: ActionExecution[] = [];
    const { outcome } = decision;

    // ── approve → auto_refund ─────────────────────────────────────────────────
    if (outcome === "approve") {
      actions.push(action(
        runId, caseId,
        "auto_refund",
        "payment",
        `Claim automatically approved — refund initiated. Risk score: ${pct(riskAssessment.consistencyScore)}. Confidence: ${pct(decision.confidence)}.`,
        { outcome, riskLevel: riskAssessment.riskLevel },
      ));
      return { actions };
    }

    // ── request_more_evidence ─────────────────────────────────────────────────
    if (outcome === "request_more_evidence") {
      const missingEvidence = this.describeMissingEvidence(decision, fusionResult);
      actions.push(action(
        runId, caseId,
        "request_more_evidence",
        "claimant_portal",
        `Claim held pending additional evidence. ${missingEvidence}`,
        {
          outcome,
          contradictions:  fusionResult.contradictions.map((c) => ({ a: c.signalA, b: c.signalB })),
          evidenceStrength: fusionResult.evidenceStrength,
        },
      ));
      return { actions };
    }

    // ── review (and legacy flag) → send_to_human_review ──────────────────────
    if (outcome === "review" || outcome === "flag") {
      actions.push(action(
        runId, caseId,
        "send_to_human_review",
        "review_queue",
        `Case escalated to manual review queue. Risk level: ${riskAssessment.riskLevel}. Triggered rules: ${this.ruleNames(decision)}.`,
        {
          outcome,
          riskLevel:       riskAssessment.riskLevel,
          riskScore:       riskAssessment.consistencyScore,
          triggeredRules:  decision.matchedRules.filter((r) => r.triggered).map((r) => r.ruleId),
        },
      ));

      // Secondary: generate evidence pack when evidence is weak (helps reviewers)
      if (
        fusionResult.evidenceStrength === "weak" ||
        fusionResult.evidenceStrength === "insufficient"
      ) {
        actions.push(action(
          runId, caseId,
          "generate_evidence_pack",
          "internal",
          `Evidence pack generated for reviewer. Strength: ${fusionResult.evidenceStrength}. Modalities covered: ${fusionResult.modalitiesCovered.join(", ")}.`,
          {
            modalitiesCovered: fusionResult.modalitiesCovered,
            evidenceStrength:  fusionResult.evidenceStrength,
            contradictions:    fusionResult.contradictions,
          },
        ));
      }

      return { actions };
    }

    // ── reject ────────────────────────────────────────────────────────────────
    if (outcome === "reject") {
      // Primary: auto_reject
      actions.push(action(
        runId, caseId,
        "auto_reject",
        "case_management",
        `Claim automatically rejected. Risk level: ${riskAssessment.riskLevel} (${pct(riskAssessment.consistencyScore)}). ${decision.explanation}`,
        { outcome, riskLevel: riskAssessment.riskLevel },
      ));

      // Secondary: block_and_flag if serious fraud signals or high/critical risk
      const shouldBlock =
        riskAssessment.riskLevel === "high" ||
        riskAssessment.riskLevel === "critical" ||
        hasFraudSignals(decision);

      if (shouldBlock) {
        actions.push(action(
          runId, caseId,
          "block_and_flag",
          "fraud_system",
          `Account flagged for fraud review. Evidence references: ${decision.evidenceReferences.join(", ")}. Risk: ${riskAssessment.riskLevel}.`,
          {
            riskLevel:          riskAssessment.riskLevel,
            evidenceReferences: decision.evidenceReferences,
            triggeredRules:     decision.matchedRules.filter((r) => r.triggered).map((r) => r.ruleId),
          },
        ));

        // Tertiary: generate evidence pack for fraud case file
        actions.push(action(
          runId, caseId,
          "generate_evidence_pack",
          "internal",
          `Evidence pack compiled for fraud case file. Signals: ${decision.evidenceReferences.join(", ")}.`,
          {
            modalitiesCovered: fusionResult.modalitiesCovered,
            evidenceStrength:  fusionResult.evidenceStrength,
            contradictions:    fusionResult.contradictions,
            riskLevel:         riskAssessment.riskLevel,
          },
        ));
      }

      return { actions };
    }

    // Fallback (should not be reached)
    actions.push(action(runId, caseId, "no_action", "internal",
      `Unhandled outcome "${outcome}" — no action taken.`,
    ));
    return { actions };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private describeMissingEvidence(
    decision: PolicyDecision,
    fusion: SignalFusionResult,
  ): string {
    const parts: string[] = [];

    if (fusion.contradictions.length > 0) {
      const pair = fusion.contradictions[0];
      parts.push(`Resolve contradiction between ${pair.signalA} and ${pair.signalB}.`);
    }

    if (!decision.evidenceReferences.includes("receipt_present")) {
      parts.push("Submit proof of purchase (receipt or invoice).");
    }

    if (!decision.evidenceReferences.includes("tracking_info_present")) {
      parts.push("Provide shipping tracking information.");
    }

    return parts.length > 0
      ? parts.join(" ")
      : "Please provide additional documentation to support your claim.";
  }

  private ruleNames(decision: PolicyDecision): string {
    return decision.matchedRules
      .filter((r) => r.triggered)
      .map((r) => r.ruleName)
      .join("; ") || "none";
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const actionAgent = new ActionAgent();
