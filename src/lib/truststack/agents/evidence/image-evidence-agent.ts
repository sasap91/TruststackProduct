/**
 * ImageEvidenceAgent
 *
 * Analyzes image artifacts for visual evidence relevant to a claim.
 * All pixel-level analysis is delegated to a VisionProvider (vendor-agnostic).
 * Swap adapters without changing signal keys or fusion logic.
 *
 * Default provider: DemoVisionProvider (deterministic, no external calls).
 *
 * Emitted signals:
 *   visible_damage           — physical damage detected in the image
 *   packaging_damage         — outer packaging shows damage
 *   missing_item_visual      — item appears absent from the image
 *   possible_image_manipulation — signs of editing or splicing
 *   image_quality_low        — image too blurry / dark / small for evidence
 */

import type { Agent } from "../index";
import type { ArtifactAnalysis } from "../../types/artifact";
import type { NormalizedSignal } from "../../types/signal";
import type { VisionFinding, VisionProvider } from "../../providers/vision-provider";
import { defaultVisionProvider } from "../../providers/vision-provider";
import { signal, EXTRACTOR } from "./shared";

export type ImageEvidenceInput = {
  artifactId: string;
  buffer: ArrayBuffer;
  mimeType?: string;
};

export type ImageEvidenceOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

function isMockVision(providerId: string): boolean {
  return (
    providerId.startsWith("demo-vision") ||
    providerId.startsWith("placeholder@")
  );
}

export class ImageEvidenceAgent implements Agent<ImageEvidenceInput, ImageEvidenceOutput> {
  readonly agentId = "image-evidence-agent";
  readonly version = "1.1.0";

  constructor(private readonly vision: VisionProvider = defaultVisionProvider) {}

  async run(input: ImageEvidenceInput): Promise<ImageEvidenceOutput> {
    const { artifactId, buffer, mimeType = "image/jpeg" } = input;
    const start = Date.now();

    const analysisVision = await this.vision.analyze(buffer, mimeType);
    const mock = isMockVision(this.vision.providerId);

    const signals: NormalizedSignal[] = [
      this.findingSignal(
        "visible_damage",
        analysisVision.visibleDamage,
        mock,
        artifactId,
        {
          detectedLabel: "Physical damage visible in image",
          absentLabel: "No visible damage detected",
          neutralLabel: "Visual damage assessment requires real vision provider",
          detectedRationale:
            "Image shows signs of physical damage consistent with or contradicting the claim.",
          absentRationale: "Image shows no visible physical damage.",
        },
      ),
      this.findingSignal(
        "packaging_damage",
        analysisVision.packagingCondition,
        mock,
        artifactId,
        {
          detectedLabel: "Outer packaging damage detected",
          absentLabel: "Packaging appears intact",
          neutralLabel: "Packaging analysis requires real vision provider",
          detectedRationale: "Damaged outer packaging supports a damage-in-transit claim.",
          absentRationale:
            "No packaging damage visible — does not corroborate a transit damage claim.",
        },
      ),
      this.findingSignal(
        "missing_item_visual",
        analysisVision.missingItemCue,
        mock,
        artifactId,
        {
          detectedLabel: "Image composition suggests item is absent",
          absentLabel: "Item appears present in image",
          neutralLabel: "Missing-item visual check requires real vision provider",
          detectedRationale:
            "Image shows an empty or partial scene inconsistent with a complete product.",
          absentRationale: "Item appears to be present in the submitted image.",
          confidenceScale: 0.8,
        },
      ),
      this.findingSignal(
        "possible_image_manipulation",
        analysisVision.manipulationLikelihood,
        mock,
        artifactId,
        {
          detectedLabel: "Image manipulation indicators detected",
          absentLabel: "No manipulation indicators detected",
          neutralLabel: "Image manipulation check requires real vision provider",
          detectedRationale:
            "EXIF inconsistencies or compression artifacts suggest image may have been edited.",
          absentRationale: "No signs of editing or splicing detected.",
        },
      ),
      this.qualitySignal(artifactId, analysisVision.imageQuality, mock),
    ];

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId: this.agentId,
      modelId: this.vision.providerId,
      provider: mock ? "demo" : undefined,
      rawScore: undefined,
      notes: analysisVision.notes,
      durationMs: Date.now() - start,
      completedAt: new Date(),
    };

    return { analysis, signals };
  }

  private findingSignal(
    key: NormalizedSignal["key"],
    finding: VisionFinding,
    mock: boolean,
    artifactId: string,
    labels: {
      detectedLabel: string;
      absentLabel: string;
      neutralLabel: string;
      detectedRationale: string;
      absentRationale: string;
      /** Multiply confidence for harder judgments */
      confidenceScale?: number;
    },
  ): NormalizedSignal {
    const scale = labels.confidenceScale ?? 1;
    const conf = Math.min(1, finding.confidence * scale);

    if (mock) {
      return signal({
        key,
        value: labels.neutralLabel,
        flag: "neutral",
        weight: key === "possible_image_manipulation" || key === "visible_damage" ? "high" : "medium",
        confidence: 0.1,
        artifactId,
        modality: "image",
        extractor: EXTRACTOR.image,
        rationale:
          "Mock vision provider — configure a live VisionProvider for evidentiary analysis.",
      });
    }

    return signal({
      key,
      value: finding.detected ? labels.detectedLabel : labels.absentLabel,
      flag: finding.detected
        ? key === "packaging_damage" || key === "missing_item_visual"
          ? "neutral"
          : "risk"
        : "clean",
      weight:
        key === "visible_damage" || key === "possible_image_manipulation"
          ? "high"
          : "medium",
      confidence: conf,
      artifactId,
      modality: "image",
      extractor: EXTRACTOR.image,
      rationale: finding.detail
        ? `${finding.detected ? labels.detectedRationale : labels.absentRationale} (${finding.detail})`
        : finding.detected
          ? labels.detectedRationale
          : labels.absentRationale,
    });
  }

  private qualitySignal(
    artifactId: string,
    imageQuality: { score: number; usableAsEvidence: boolean; detail?: string },
    mock: boolean,
  ): NormalizedSignal {
    const score = imageQuality.score;
    const isLow = !imageQuality.usableAsEvidence || score < 0.4;

    return signal({
      key: "image_quality_low",
      value: isLow
        ? `Low image quality (score: ${Math.round(score * 100)}%)`
        : `Adequate image quality (score: ${Math.round(score * 100)}%)`,
      flag: isLow ? "risk" : "clean",
      weight: "medium",
      rawScore: score,
      confidence: mock ? 0.4 : Math.min(1, 0.5 + score * 0.5),
      artifactId,
      modality: "image",
      extractor: EXTRACTOR.image,
      rationale: imageQuality.detail
        ? `${isLow ? "Image may be too small, blurry, or dark to serve as reliable evidence." : "Image quality is sufficient to be used as evidence."} ${imageQuality.detail}`
        : isLow
          ? "Image may be too small, blurry, or dark to serve as reliable evidence."
          : "Image quality is sufficient to be used as evidence.",
    });
  }
}

export const imageEvidenceAgent = new ImageEvidenceAgent();
