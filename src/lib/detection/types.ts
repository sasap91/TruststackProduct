export type DetectionSource =
  | "huggingface"
  | "openai-moderation"
  | "aiornot"
  | "demo";

export type DetectionResult = {
  /** Estimated probability content is AI-generated or policy-violating, 0–1 */
  aiProbability: number;
  source: DetectionSource;
  modelId?: string;
  /** Human-readable caveats or errors from the provider */
  notes?: string[];
};

// ─── Signals ──────────────────────────────────────────────────────────────────
// Signals are the sole currency between agents (Layer 1), the consistency
// engine (Layer 2), and the policy / action layers (Layer 3).
// Raw media and raw scores must NOT be passed beyond Layer 1.

export type SignalFlag = "risk" | "neutral" | "clean";
export type SignalWeight = "high" | "medium" | "low";

export type Signal = {
  /** Stable identifier used by policy rules, e.g. "image_authenticity" */
  key: string;
  /** Human-readable display name */
  name: string;
  /** Human-readable value summary */
  value: string;
  flag: SignalFlag;
  weight: SignalWeight;
  /**
   * Raw numeric score that produced this signal (0–1).
   * Preserved for audit trail and threshold-aware policy rules.
   */
  score?: number;
  detail?: string;
};

export type PolicyDecision = "approve" | "flag" | "reject";

// ─── Case metadata ────────────────────────────────────────────────────────────

export type CaseStatus =
  | "OPEN"
  | "ANALYZING"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FLAGGED";

export type EvidenceType =
  | "IMAGE"
  | "TEXT"
  | "DOCUMENT"
  | "ORDER_DATA"
  | "METADATA";

export type ClaimMetadata = {
  /** Claimed reason, e.g. "damaged_item" | "not_received" | "wrong_item" */
  claimType?: string;
  /** Logistics delivery status, e.g. "delivered_intact" | "not_delivered" | "unknown" */
  deliveryStatus?: string;
  /** Hours since claim was submitted */
  claimAgeHours?: number;
  /** Whether item is high-value (> threshold) */
  highValue?: boolean;
  /** Requester historical refund rate 0-1 */
  refundRate?: number;
  /** Whether photo/video evidence was provided */
  hasVideoProof?: boolean;
};

// ─── Full case analysis response ──────────────────────────────────────────────

export type ClaimAnalysis = {
  /** Human-readable case reference, e.g. "TS-2026-A3F9" */
  caseRef: string;
  /** Fused signal list from all modality agents */
  signals: Signal[];
  /** 0 = fully consistent, 1 = maximally inconsistent */
  consistencyScore: number;
  decision: PolicyDecision;
  justification: string;
  auditTrail: string[];
  judgeSource: "claude" | "demo";
  // Per-artifact scores surfaced for the dashboard (not consumed by policy)
  imageAiProbability?: number;
  textAiProbability?: number;
};
