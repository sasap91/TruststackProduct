/**
 * RiskAssessment — the output of the signal fusion / consistency engine.
 *
 * Takes all NormalizedSignals from all artifact analyses and produces a
 * single coherent risk picture for the policy engine.
 */

import type { NormalizedSignal } from "./signal";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskAssessment = {
  caseId: string;

  /** Fused signal list from all modality agents */
  signals: NormalizedSignal[];

  /**
   * Overall inconsistency score: 0 = fully consistent, 1 = maximally inconsistent.
   * Derived from weighted risk point ratio across all signals.
   */
  consistencyScore: number;

  /** Categorical risk level derived from consistencyScore */
  riskLevel: RiskLevel;

  assessedAt: Date;
  /** Engine or agent that produced this assessment */
  assessedBy: string;
};

/** Derive a RiskLevel from a 0–1 consistency score */
export function toRiskLevel(consistencyScore: number): RiskLevel {
  if (consistencyScore >= 0.75) return "critical";
  if (consistencyScore >= 0.5)  return "high";
  if (consistencyScore >= 0.25) return "medium";
  return "low";
}
