/**
 * EvidenceArtifact — a single piece of evidence attached to a ClaimCase.
 *
 * Each artifact is analyzed by exactly one modality-specific agent.
 * The agent populates `analysis` in-place once it completes.
 */

export type ArtifactModality =
  | "image"
  | "text"
  | "document"
  | "metadata"
  | "video";

export type ArtifactStatus = "pending" | "analyzing" | "complete" | "failed";

export type EvidenceArtifact = {
  /** Stable local ID (cuid / uuid). Used as reference in NormalizedSignal.sourceArtifactIds */
  id: string;
  caseId: string;
  modality: ArtifactModality;
  status: ArtifactStatus;

  // ── Raw content ────────────────────────────────────────────────────────────
  /** Inline text content (for modality "text" | "document" | "metadata") */
  content?: string;
  /** Binary storage reference (object-store key for images, video) */
  storageRef?: string;
  mimeType?: string;
  sizeBytes?: number;
  filename?: string;

  // ── Agent output (populated after analysis completes) ──────────────────────
  analysis?: ArtifactAnalysis;

  createdAt: Date;
};

/**
 * ArtifactAnalysis — the normalized output from one modality agent.
 *
 * Agents must NOT return raw probabilities or raw media references.
 * All findings are expressed as NormalizedSignals.
 */
export type ArtifactAnalysis = {
  artifactId: string;
  /** Stable agent identifier, e.g. "image-ai-agent@1.0" */
  agentId: string;
  /** Underlying model used, e.g. "aiornot-v2", "roberta-base-openai-detector" */
  modelId?: string;
  /** Detection provider */
  provider?: "aiornot" | "huggingface" | "openai-moderation" | "claude" | "demo";
  /**
   * Raw probability score from the underlying model (0–1).
   * Stored for debugging and dashboard display only.
   * Policy and downstream engines must use signals, not this value.
   */
  rawScore?: number;
  /** Human-readable caveats from the provider (e.g. "demo mode", "model error") */
  notes?: string[];
  durationMs?: number;
  completedAt: Date;
};
