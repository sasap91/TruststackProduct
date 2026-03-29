/**
 * NormalizedSignal — the universal unit of evidence between pipeline stages.
 *
 * Signals are the ONLY data that flows from agents → risk engine → policy engine.
 * Raw media, raw scores, and raw API responses must never cross this boundary.
 *
 * Every consumer of signals (risk fusion, policy rules, LLM judge) must work
 * exclusively from this contract.
 */

import type { ArtifactModality } from "./artifact";

export type SignalFlag = "risk" | "neutral" | "clean";
export type SignalWeight = "high" | "medium" | "low";

export type NormalizedSignal = {
  /**
   * Stable machine-readable key used by policy rules.
   * Convention: snake_case, e.g. "image_authenticity", "logistics_conflict".
   * Keys must be stable across model upgrades — never hash or timestamp-based.
   */
  key: string;

  /** Human-readable summary value, e.g. "87% AI-generated likelihood" */
  value: string;

  /**
   * Confidence in the signal assessment, 0–1.
   * Distinct from rawScore: this represents the agent's certainty about the
   * signal's classification (risk/neutral/clean), not the underlying model score.
   * e.g. a 90% AI probability → high confidence "risk" signal (confidence ≈ 0.9)
   * a 55% AI probability → low confidence "neutral" signal (confidence ≈ 0.5)
   */
  confidence: number;

  /** Which artifacts contributed to this signal. Enables traceability. */
  sourceArtifactIds: string[];

  /** The modality that produced this signal */
  sourceModality: ArtifactModality;

  /** Agent or rule that extracted this signal, e.g. "image-ai-agent", "logistics-rule" */
  extractor: string;

  /** Brief explanation of why this signal was raised (shown in audit trail) */
  rationale?: string;

  /** When this signal was generated */
  timestamp: Date;

  // ── Classification ─────────────────────────────────────────────────────────
  flag: SignalFlag;
  weight: SignalWeight;

  /**
   * Underlying raw numeric score (0–1) from the model, if applicable.
   * Used by policy rules for threshold comparison — not to be confused with confidence.
   */
  rawScore?: number;
};
