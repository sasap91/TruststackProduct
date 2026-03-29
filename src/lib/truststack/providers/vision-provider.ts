/**
 * VisionProvider — interface for vision-model backends.
 *
 * Returns structured per-finding assessments with individual confidence scores,
 * not just boolean flags. This allows downstream signal builders to express
 * "definitely damaged" vs "possibly damaged" accurately.
 *
 * The ImageEvidenceAgent delegates all pixel-level analysis here.
 * Swap providers without touching agent or signal logic.
 *
 * Registered providers:
 *   - DemoVisionProvider       (default — deterministic hash-based, no external calls)
 *   - OpenAIVisionProvider     (future — GPT-4o image analysis)
 *   - AiOrNotVisionProvider    (future — AI or Not v2 image endpoint)
 *   - RekognitionProvider      (future — AWS Rekognition labels + custom models)
 *   - GeminiVisionProvider     (future — Google Gemini Pro Vision)
 *
 * Migration from ImageAnalysisProvider:
 *   Use wrapLegacyProvider() to adapt an existing ImageAnalysisProvider to
 *   this interface without changing agent code.
 */

import type { ImageAnalysisProvider } from "./image-provider";

// ── Output types ──────────────────────────────────────────────────────────────

/** A single visual finding with its own confidence score. */
export type VisionFinding = {
  /** Whether the provider believes this condition is present */
  detected:    boolean;
  /**
   * Provider's confidence in THIS specific finding (0–1).
   * Distinct from the overall provider confidence — a model may be very
   * confident about damage but uncertain about manipulation.
   */
  confidence:  number;
  /** Optional human-readable detail from the model */
  detail?:     string;
};

export type VisionAnalysis = {
  /**
   * Physical damage to the item (scratches, cracks, dents, breakage).
   * Primary signal for damaged_item claims.
   */
  visibleDamage:          VisionFinding;

  /**
   * Damage or compromised integrity of outer packaging.
   * Supports transit-damage claims; does not by itself confirm item damage.
   */
  packagingCondition:     VisionFinding;

  /**
   * Image composition suggests the claimed item is absent (empty box,
   * unrelated item photographed, or scene inconsistent with described item).
   */
  missingItemCue:         VisionFinding;

  /**
   * Likelihood that the image was edited: EXIF inconsistencies,
   * compression artifacts, splice boundaries, or AI-generated patterns.
   */
  manipulationLikelihood: VisionFinding;

  /** Image quality assessment — separate from findings. */
  imageQuality: {
    /** 0–1: 0 = unusable, 1 = publication-quality */
    score:            number;
    /** True if quality is sufficient for evidentiary use (score ≥ 0.4) */
    usableAsEvidence: boolean;
    detail?:          string;
  };

  /** Aggregate confidence across ALL findings from this provider call */
  overallConfidence: number;

  notes?: string[];
};

// ── Provider contract ─────────────────────────────────────────────────────────

export interface VisionProvider {
  /** Stable identifier, e.g. "demo@1.0", "openai-vision@gpt-4o" */
  readonly providerId: string;
  analyze(buffer: ArrayBuffer, mimeType: string): Promise<VisionAnalysis>;
}

// ── Demo adapter ──────────────────────────────────────────────────────────────
// Deterministic from image bytes; carries no evidentiary value.
// Findings default to false with low confidence so downstream signals
// are appropriately neutral/weak.

function fnv32(data: Uint8Array, limit = 512): number {
  let h = 0x811c9dc5;
  const end = Math.min(data.length, limit);
  for (let i = 0; i < end; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export class DemoVisionProvider implements VisionProvider {
  readonly providerId = "demo-vision@1.0";

  async analyze(buffer: ArrayBuffer, _mimeType: string): Promise<VisionAnalysis> {
    const bytes = new Uint8Array(buffer);
    const hash  = fnv32(bytes);

    // Derive pseudo-deterministic booleans from hash bits (no content correlation)
    const bits = {
      damage:       (hash & 0b00000001) !== 0,
      packaging:    (hash & 0b00000010) !== 0,
      missingItem:  (hash & 0b00000100) !== 0,
      manipulation: (hash & 0b00001000) !== 0,
    };

    // Quality: rough heuristic from file size — very small files are likely thumbnails
    const qualityScore = buffer.byteLength < 20_000 ? 0.25
                       : buffer.byteLength < 80_000 ? 0.55
                       : 0.75;

    return {
      visibleDamage: {
        detected:   bits.damage,
        confidence: 0.12,
        detail:     "Demo — no real vision model called.",
      },
      packagingCondition: {
        detected:   bits.packaging,
        confidence: 0.12,
        detail:     "Demo — no real vision model called.",
      },
      missingItemCue: {
        detected:   bits.missingItem,
        confidence: 0.10,
        detail:     "Demo — no real vision model called.",
      },
      manipulationLikelihood: {
        detected:   bits.manipulation,
        confidence: 0.12,
        detail:     "Demo — no real vision model called.",
      },
      imageQuality: {
        score:            qualityScore,
        usableAsEvidence: qualityScore >= 0.4,
        detail:           `Size-derived quality estimate (${(buffer.byteLength / 1024).toFixed(0)} KB).`,
      },
      overallConfidence: 0.12,
      notes: [
        "demo-vision: deterministic from image hash — findings have no evidentiary value.",
        "Configure VISION_PROVIDER env var to enable real visual analysis.",
      ],
    };
  }
}

// ── Legacy adapter ────────────────────────────────────────────────────────────

/**
 * Wrap a legacy ImageAnalysisProvider to satisfy the VisionProvider interface.
 * Allows gradual migration without breaking existing code.
 */
export function wrapLegacyProvider(old: ImageAnalysisProvider): VisionProvider {
  return {
    providerId: old.providerId,
    async analyze(buffer: ArrayBuffer, mimeType: string): Promise<VisionAnalysis> {
      const r    = await old.analyze(buffer, mimeType);
      const conf = r.overallConfidence ?? 0.5;

      return {
        visibleDamage:          { detected: r.visibleDamage        ?? false, confidence: conf },
        packagingCondition:     { detected: r.packagingDamage      ?? false, confidence: conf },
        missingItemCue:         { detected: r.missingItemVisual    ?? false, confidence: conf },
        manipulationLikelihood: { detected: r.possibleManipulation ?? false, confidence: conf },
        imageQuality: {
          score:            r.imageQualityScore ?? 0.5,
          usableAsEvidence: (r.imageQualityScore ?? 0.5) >= 0.4,
        },
        overallConfidence: conf,
        notes: r.notes,
      };
    },
  };
}

export const defaultVisionProvider: VisionProvider = new DemoVisionProvider();
