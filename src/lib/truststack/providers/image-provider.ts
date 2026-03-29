/**
 * ImageAnalysisProvider — interface for vision-model backends.
 *
 * Legacy ImageAnalysisProvider — use VisionProvider + wrapLegacyProvider for new code.
 * ImageEvidenceAgent consumes VisionProvider (see vision-provider.ts).
 * Swap the provider without touching agent or signal logic.
 *
 * Registered providers (add as integrations mature):
 *   - DeterministicPlaceholderProvider  (default — no external call)
 *   - AiOrNotVisionProvider             (future — AI or Not v2 image endpoint)
 *   - OpenAIVisionProvider              (future — GPT-4o image analysis)
 *   - RekognitionProvider               (future — AWS Rekognition labels)
 */

// ── Provider contract ─────────────────────────────────────────────────────────

export type ImageAnalysisResult = {
  /** Physical damage visible in the image (scratches, cracks, dents) */
  visibleDamage?: boolean;
  /** Damage to outer packaging */
  packagingDamage?: boolean;
  /** Image composition suggests the claimed item is absent */
  missingItemVisual?: boolean;
  /** EXIF inconsistencies, compression artifacts, or obvious editing */
  possibleManipulation?: boolean;
  /**
   * Image quality 0–1.
   * < 0.3 = too blurry / dark / small to be useful evidence
   * ≥ 0.7 = clear and usable
   */
  imageQualityScore?: number;
  /** Provider-level confidence in all assessments, 0–1 */
  overallConfidence?: number;
  notes?: string[];
};

export interface ImageAnalysisProvider {
  /** Stable identifier, e.g. "placeholder@1.0", "aiornot-vision@2.0" */
  readonly providerId: string;
  analyze(buffer: ArrayBuffer, mimeType: string): Promise<ImageAnalysisResult>;
}

// ── Deterministic placeholder ─────────────────────────────────────────────────
// Used when no real vision provider is configured.
// Results are reproducible (same image → same output) but carry no evidentiary
// value. All signals produced from this provider should be flagged "neutral".

function fnv32(data: Uint8Array, limit = 512): number {
  let h = 0x811c9dc5;
  const end = Math.min(data.length, limit);
  for (let i = 0; i < end; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export class DeterministicPlaceholderProvider implements ImageAnalysisProvider {
  readonly providerId = "placeholder@1.0";

  async analyze(buffer: ArrayBuffer): Promise<ImageAnalysisResult> {
    const bytes = new Uint8Array(buffer);
    const hash  = fnv32(bytes);

    // Derive pseudo-deterministic booleans from hash bits.
    // These have NO correlation to actual image content.
    const visibleDamage        = (hash & 0b0001) !== 0;
    const packagingDamage      = (hash & 0b0010) !== 0;
    const missingItemVisual    = (hash & 0b0100) !== 0;
    const possibleManipulation = (hash & 0b1000) !== 0;
    // Quality: rough heuristic from file size (very small = likely thumbnail)
    const imageQualityScore = buffer.byteLength < 20_000 ? 0.3
                            : buffer.byteLength < 80_000 ? 0.6
                            : 0.8;

    return {
      visibleDamage,
      packagingDamage,
      missingItemVisual,
      possibleManipulation,
      imageQualityScore,
      overallConfidence: 0.15,   // deliberately low — these are not real observations
      notes: [
        "placeholder: no vision provider configured — signals are deterministic from image hash, not real analysis.",
        "To enable real visual analysis set IMAGE_ANALYSIS_PROVIDER in env.",
      ],
    };
  }
}

export const defaultImageProvider: ImageAnalysisProvider =
  new DeterministicPlaceholderProvider();
