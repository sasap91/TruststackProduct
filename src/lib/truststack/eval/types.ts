/**
 * TrustStack evaluation types — fixtures, expectations, run results.
 * Used for regression testing, threshold calibration, and replay against policy packs.
 */

import type { SignalFlag } from "../types/signal";
import type { DecisionOutcome } from "../types/policy";
import type { EvidenceStrength } from "../types/fusion";
import type { ClaimCase } from "../types/case";
import type { TrustStackProviderDeps } from "../providers/truststack-providers";

/** Match a fused signal by key and optional flag / confidence floor */
export type ExpectedSignalSpec = {
  key: string;
  /** If omitted, key presence with any flag passes */
  flag?: SignalFlag | SignalFlag[];
  minConfidence?: number;
};

/** Expected cross-modal contradiction (unordered key pair) */
export type ExpectedContradictionSpec = {
  keys: [string, string];
  severity?: "strong" | "weak";
};

export type EvalExpectation = {
  /** Fused signals that must be present after fusion */
  signals: ExpectedSignalSpec[];
  /** Expected contradiction pairs (subset — extra contradictions can still pass if not strict) */
  contradictions: ExpectedContradictionSpec[];
  /** Policy outcome from PolicyAgent */
  policyOutcome: DecisionOutcome;
  /** Optional: assert fusion evidence strength */
  evidenceStrength?: EvidenceStrength;
  /** When true, fail if fusion reports contradictions not listed in `contradictions` */
  strictContradictions?: boolean;
};

/**
 * A reproducible multimodal scenario: case shape + stub providers + expectations.
 */
export type MultimodalEvalFixture = {
  id: string;
  name: string;
  description: string;
  /** Stable case id for reproducible runs and feedback linkage */
  caseId: string;
  userId?: string;
  ref?: string;
  /** Human-readable claim text (also used as description) */
  claimText: string;
  /** Partial ClaimCase fields merged into a full case by the harness */
  caseFields: Partial<
    Omit<
      ClaimCase,
      | "id"
      | "ref"
      | "userId"
      | "status"
      | "evidence"
      | "createdAt"
      | "updatedAt"
      | "latestRun"
    >
  >;
  /**
   * Evidence layout: artifact definitions without id/caseId (filled by builder).
   * Use modality + optional content / mime hints.
   */
  evidenceLayout: EvalEvidenceSlot[];
  /**
   * Optional tiny image bytes keyed by slot id after build (image slots only).
   * If omitted for an image slot, harness supplies minimal JPEG bytes.
   */
  imagePlaceholderBySlotId?: Record<string, ArrayBuffer>;
  /** Optional document plain text by slot id */
  documentTextBySlotId?: Record<string, string>;
  /** Injected providers for deterministic eval (required for stable signal expectations) */
  providers: TrustStackProviderDeps;
  expect: EvalExpectation;
};

export type EvalEvidenceSlot =
  | { slotId: string; modality: "text" }
  | { slotId: string; modality: "image"; mimeType?: string }
  | { slotId: string; modality: "document"; filename?: string; mimeType?: string };

export type EvalSignalMismatch = {
  spec: ExpectedSignalSpec;
  reason: string;
};

export type EvalContradictionMismatch = {
  spec: ExpectedContradictionSpec;
  reason: string;
};

export type EvalRunResult = {
  fixtureId: string;
  passed: boolean;
  actualOutcome: DecisionOutcome | null;
  expectedOutcome: DecisionOutcome;
  signalMismatches: EvalSignalMismatch[];
  contradictionMismatches: EvalContradictionMismatch[];
  evidenceStrengthMismatch?: { expected: EvidenceStrength; actual: EvidenceStrength };
  extraContradictions?: string[];
  runId?: string;
  /** Serialized for replay / dashboards */
  snapshot?: {
    fusedSignalKeys: string[];
    contradictionPairs: string[];
    riskLevel?: string;
    consistencyScore?: number;
  };
};
