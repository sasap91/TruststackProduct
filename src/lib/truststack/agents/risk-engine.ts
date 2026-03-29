/**
 * RiskAssessmentEngine
 *
 * Pure signal fusion engine. Accepts the complete set of NormalizedSignals
 * from all evidence agents and computes an overall RiskAssessment.
 *
 * This engine does NOT generate signals. Signal generation is the
 * responsibility of the modality-specific evidence agents:
 *   - TextEvidenceAgent     → text-based signals
 *   - ImageEvidenceAgent    → visual signals
 *   - DocumentEvidenceAgent → document extraction signals
 *   - MetadataEvidenceAgent → order/customer context signals
 *
 * The engine's only job is to weight and aggregate the incoming signals
 * into a consistency score and risk level.
 */

import type { Agent } from "./index";
import type { NormalizedSignal } from "../types/signal";
import type { RiskAssessment } from "../types/risk";
import { toRiskLevel } from "../types/risk";

export type RiskEngineInput = {
  caseId: string;
  /** Complete signal set from all evidence agents */
  signals: NormalizedSignal[];
};

export type RiskEngineOutput = RiskAssessment;

// Signal weight → base risk point value
const WEIGHT_POINTS: Record<string, number> = {
  high:   3,
  medium: 2,
  low:    1,
};

export class RiskAssessmentEngine implements Agent<RiskEngineInput, RiskEngineOutput> {
  readonly agentId = "risk-assessment-engine";
  readonly version = "1.1.0";

  async run(input: RiskEngineInput): Promise<RiskEngineOutput> {
    const { caseId, signals } = input;

    let weightedRisk = 0;
    let weightedMax  = 0;

    for (const s of signals) {
      const base = WEIGHT_POINTS[s.weight] ?? 1;
      // Scale contribution by signal confidence
      const pts  = base * s.confidence;
      weightedMax += pts;

      if (s.flag === "risk") {
        weightedRisk += pts;
      } else if (s.flag === "neutral") {
        // Neutral signals contribute a fraction — they add uncertainty but not full risk
        weightedRisk += pts * 0.25;
      }
      // "clean" signals contribute 0 to risk
    }

    const consistencyScore = weightedMax > 0
      ? Math.min(1, weightedRisk / weightedMax)
      : 0;

    return {
      caseId,
      signals,
      consistencyScore,
      riskLevel: toRiskLevel(consistencyScore),
      assessedAt: new Date(),
      assessedBy: this.agentId,
    };
  }
}

export const riskAssessmentEngine = new RiskAssessmentEngine();
