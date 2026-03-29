/**
 * Signal builder utilities shared across all evidence agents.
 *
 * All agents must produce NormalizedSignals with the same schema.
 * Use `signal()` rather than constructing objects inline so the shape
 * stays consistent as the type evolves.
 */

import type { NormalizedSignal, SignalFlag, SignalWeight } from "../../types/signal";
import type { ArtifactModality } from "../../types/artifact";

type SignalParams = {
  key: string;
  value: string;
  flag: SignalFlag;
  weight: SignalWeight;
  confidence: number;
  artifactId: string;
  modality: ArtifactModality;
  extractor: string;
  rawScore?: number;
  rationale?: string;
};

/** Build a NormalizedSignal. Clamps confidence to [0, 1]. */
export function signal(p: SignalParams): NormalizedSignal {
  return {
    key: p.key,
    value: p.value,
    flag: p.flag,
    weight: p.weight,
    confidence: Math.min(1, Math.max(0, p.confidence)),
    rawScore: p.rawScore,
    rationale: p.rationale,
    sourceArtifactIds: [p.artifactId],
    sourceModality: p.modality,
    extractor: p.extractor,
    timestamp: new Date(),
  };
}

/** Common extractor ID helper — keeps agent IDs consistent */
export const EXTRACTOR = {
  text:     "text-evidence-agent@1.0",
  image:    "image-evidence-agent@1.0",
  document: "document-evidence-agent@1.0",
  metadata: "metadata-evidence-agent@1.0",
} as const;
