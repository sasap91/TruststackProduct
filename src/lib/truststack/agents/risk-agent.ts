/**
 * RiskAgent
 *
 * Category-weighted risk scorer. Accepts a SignalFusionResult and produces
 * a RiskAssessment using a four-category scoring model:
 *
 *   fraud_evidence  (35%) — visual / document manipulation signals
 *   claim_integrity (30%) — text semantics, logistics conflicts
 *   account_risk    (20%) — refund history, account age, repeat claims
 *   procedural      (15%) — late filing, missing video proof, delivery conflict
 *
 * Additional adjustments:
 *   - Strong contradictions add a consistency penalty (up to +0.15)
 *   - Insufficient evidence reduces score toward the midpoint (0.5)
 *   - Score is always in [0, 1]
 *
 * This agent is deterministic and makes no external calls.
 * It does NOT make policy decisions — it only quantifies risk.
 */

import type { Agent } from "./index";
import type { FusedSignal } from "../types/fusion";
import type { SignalFusionResult } from "../types/fusion";
import type { RiskAssessment, RiskLevel } from "../types/risk";
import { toRiskLevel } from "../types/risk";

export type RiskAgentInput = {
  caseId: string;
  fusionResult: SignalFusionResult;
  /**
   * Custom category weights from MerchantPolicy.
   * If omitted, hardcoded defaults (fraud 35%, claim_integrity 30%,
   * account 20%, procedural 15%) are used — no breaking change.
   */
  weights?: {
    fraud:          number;
    claimIntegrity: number;
    account:        number;
    procedural:     number;
  };
};

// ── Category membership ───────────────────────────────────────────────────────

type RiskCategory = "fraud_evidence" | "claim_integrity" | "account_risk" | "procedural";

const CATEGORY_WEIGHTS: Record<RiskCategory, number> = {
  fraud_evidence:  0.35,
  claim_integrity: 0.30,
  account_risk:    0.20,
  procedural:      0.15,
};

const SIGNAL_CATEGORIES: Record<string, RiskCategory> = {
  // fraud_evidence
  visible_damage:               "fraud_evidence",
  packaging_damage:             "fraud_evidence",
  missing_item_visual:          "fraud_evidence",
  possible_image_manipulation:  "fraud_evidence",
  image_quality_low:            "fraud_evidence",
  receipt_present:              "fraud_evidence",
  tracking_info_present:        "fraud_evidence",
  invoice_mismatch:             "fraud_evidence",
  policy_document_reference:    "fraud_evidence",

  // claim_integrity
  claim_intent:                 "claim_integrity",
  damage_claimed:               "claim_integrity",
  suspicious_language:          "claim_integrity",
  urgency_level:                "claim_integrity",
  delivered_but_claimed_missing:"claim_integrity",

  // account_risk
  high_refund_rate:             "account_risk",
  repeat_claimant:              "account_risk",
  new_account:                  "account_risk",
  high_value_item:              "account_risk",

  // procedural
  late_claim:                   "procedural",
  no_video_proof:               "procedural",
};

function signalCategory(key: string): RiskCategory | null {
  return SIGNAL_CATEGORIES[key] ?? null;
}

// ── Risk point computation ────────────────────────────────────────────────────

const FLAG_MULTIPLIER: Record<string, number> = {
  risk:    1.0,
  neutral: 0.25,
  clean:   0.0,
};

const WEIGHT_BASE: Record<string, number> = {
  high:   3,
  medium: 2,
  low:    1,
};

function signalRiskContribution(s: FusedSignal): { points: number; maxPoints: number } {
  const base       = WEIGHT_BASE[s.weight]   ?? 1;
  const multiplier = FLAG_MULTIPLIER[s.flag] ?? 0;
  const pts        = base * s.confidence * multiplier;
  const maxPts     = base * s.confidence;
  return { points: pts, maxPoints: maxPts };
}

// ── RiskAgent ─────────────────────────────────────────────────────────────────

export class RiskAgent implements Agent<RiskAgentInput, RiskAssessment> {
  readonly agentId = "risk-agent";
  readonly version = "1.0.0";

  async run(input: RiskAgentInput): Promise<RiskAssessment> {
    const { caseId, fusionResult } = input;
    const { fusedSignals, contradictions, evidenceStrength, claimEvidenceConsistency } = fusionResult;

    // Accumulate risk points per category
    const categoryRisk: Record<RiskCategory, number> = {
      fraud_evidence:  0,
      claim_integrity: 0,
      account_risk:    0,
      procedural:      0,
    };
    const categoryMax: Record<RiskCategory, number> = {
      fraud_evidence:  0,
      claim_integrity: 0,
      account_risk:    0,
      procedural:      0,
    };

    for (const s of fusedSignals) {
      const cat = signalCategory(s.key);
      if (!cat) continue; // unknown signal keys contribute to no category
      const { points, maxPoints } = signalRiskContribution(s);
      categoryRisk[cat] += points;
      categoryMax[cat]  += maxPoints;
    }

    // Compute per-category scores (0–1), then weighted average
    let weightedScore = 0;
    let appliedWeight = 0;

    const effectiveWeights: Record<RiskCategory, number> = input.weights
      ? {
          fraud_evidence:  input.weights.fraud,
          claim_integrity: input.weights.claimIntegrity,
          account_risk:    input.weights.account,
          procedural:      input.weights.procedural,
        }
      : CATEGORY_WEIGHTS;

    for (const [cat, weight] of Object.entries(effectiveWeights) as [RiskCategory, number][]) {
      if (categoryMax[cat] === 0) continue; // no signals in this category
      const catScore = Math.min(1, categoryRisk[cat] / categoryMax[cat]);
      weightedScore  += catScore * weight;
      appliedWeight  += weight;
    }

    // Normalize to applied weight (handles missing categories gracefully)
    let riskScore = appliedWeight > 0 ? weightedScore / appliedWeight : 0;

    // Contradiction penalty: each strong contradiction adds up to 0.15 to risk
    const strongCount = contradictions.filter((c) => c.severity === "strong").length;
    const weakCount   = contradictions.filter((c) => c.severity === "weak").length;
    const contradictionBoost = Math.min(0.2, strongCount * 0.1 + weakCount * 0.03);
    riskScore = Math.min(1, riskScore + contradictionBoost);

    // Insufficient evidence: pull score toward 0.4 (uncertain midpoint)
    if (evidenceStrength === "insufficient") {
      riskScore = riskScore * 0.5 + 0.4 * 0.5;
    }

    // Consistency adjustment: inconsistent evidence inflates risk slightly
    const inconsistencyPenalty = (1 - claimEvidenceConsistency) * 0.1;
    riskScore = Math.min(1, riskScore + inconsistencyPenalty);

    riskScore = Math.max(0, Math.min(1, riskScore));

    // consistencyScore for RiskAssessment maps to the overall risk score
    return {
      caseId,
      signals:          fusedSignals,
      consistencyScore: riskScore,
      riskLevel:        toRiskLevel(riskScore),
      assessedAt:       new Date(),
      assessedBy:       this.agentId,
    };
  }
}

export const riskAgent = new RiskAgent();
