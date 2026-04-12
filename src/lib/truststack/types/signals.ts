/**
 * TrustStack deterministic pipeline — LLM signal types.
 *
 * Each interface is the exact return type of one pipeline LLM step.
 * The policy engine consumes MergedSignals and never sees raw LLM responses.
 */

import type { ClassifierOutput } from "./claim";

// ── Step 2: extract_visual() ────────────────────────────────────────────────

/** Returned by extract_visual() (claude-opus-4-6). */
export interface VisualSignals {
  /**
   * true when extract_visual() was not called for this claim
   * (never_arrived, chargeback, or no photos submitted).
   * All other fields are null / false / empty when skipped.
   */
  skipped: boolean;
  /** true → HARD_001 triggers immediately */
  aiGeneratedPhotoDetected: boolean;
  /** null when skipped */
  photoMatchesDescription: boolean | null;
  /** null when skipped */
  damageVisible: boolean | null;
  /** Free-text descriptions of suspicious visual elements; empty when skipped */
  suspiciousElements: string[];
  /** Raw model assessment text, empty string when skipped */
  rawAssessment: string;
}

// ── Step 3: extract_text() ──────────────────────────────────────────────────

/** Returned by extract_text() (claude-haiku-4-5-20251001). */
export interface TextSignals {
  claimsConsistentWithType: boolean;
  /** Dates / sequence of events are internally inconsistent */
  timelineAnomaly: boolean;
  /** Language patterns associated with coached or escalated claims */
  highValueLanguage: boolean;
  evidenceDocumentsPresent: boolean;
  parsedDocuments: ParsedDocument[];
  /** Free-text list of red flags identified in the text */
  redFlags: string[];
}

export interface ParsedDocument {
  url: string;
  docType: "receipt" | "tracking" | "photo" | "correspondence" | "other";
  extractedText: string;
  anomalies: string[];
}

// ── Step 4: check_consistency() ─────────────────────────────────────────────

/** Returned by check_consistency() (claude-sonnet-4-6). */
export interface ConsistencySignals {
  /**
   * 0.0 = fully inconsistent, 1.0 = fully consistent.
   * Score < 0.20 → HARD_002 hard reject.
   */
  score: number;
  /** Each entry is a human-readable description of one cross-signal conflict */
  crossSignalConflicts: string[];
  timelineConsistent: boolean;
  narrativeCoherent: boolean;
  /** Raw model assessment text */
  rawAssessment: string;
}

// ── Merged input to the policy engine ───────────────────────────────────────

/**
 * All signal outputs assembled by signal-merge.ts before the policy engine runs.
 * This is the single input surface for policy evaluation.
 */
export interface MergedSignals {
  classifier: ClassifierOutput;
  visual: VisualSignals;
  text: TextSignals;
  consistency: ConsistencySignals;
}
