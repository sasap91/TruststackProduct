/**
 * ImageAnalysisAgent
 *
 * Analyzes an image artifact for synthetic / AI-generated content.
 * Delegates to the configured provider (AI or Not → HuggingFace → demo).
 * Outputs an ArtifactAnalysis; raw score is stored there for debugging
 * but NormalizedSignals are the authoritative output for downstream stages.
 */

import type { Agent } from "./index";
import type { ArtifactAnalysis } from "../types/artifact";
import type { NormalizedSignal } from "../types/signal";
import { runImageDetection } from "@/lib/detection/run";
import { sniffImageMime } from "@/lib/image-mime";

export type ImageAgentInput = {
  artifactId: string;
  buffer: ArrayBuffer;
  /** Caller may supply a pre-detected MIME; agent will re-sniff if absent */
  mimeType?: string;
};

export type ImageAgentOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

export class ImageAnalysisAgent implements Agent<ImageAgentInput, ImageAgentOutput> {
  readonly agentId = "image-ai-agent";
  readonly version = "1.0.0";

  async run(input: ImageAgentInput): Promise<ImageAgentOutput> {
    const { artifactId, buffer } = input;
    const mime = input.mimeType ?? sniffImageMime(buffer) ?? "image/jpeg";
    const start = Date.now();

    const result = await runImageDetection(buffer, mime);

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId: this.agentId,
      modelId: result.modelId,
      provider: result.source === "huggingface" ? "huggingface"
               : result.source === "demo"       ? "demo"
               : "aiornot",
      rawScore: result.aiProbability,
      notes: result.notes,
      durationMs: Date.now() - start,
      completedAt: new Date(),
    };

    const signals = this.toSignals(artifactId, result.aiProbability);
    return { analysis, signals };
  }

  private toSignals(artifactId: string, prob: number): NormalizedSignal[] {
    const now = new Date();

    if (prob >= 0.75) {
      return [{
        key: "image_authenticity",
        value: `${Math.round(prob * 100)}% AI-generated likelihood`,
        confidence: prob,
        sourceArtifactIds: [artifactId],
        sourceModality: "image",
        extractor: this.agentId,
        rationale: "Image shows strong indicators of synthetic generation.",
        timestamp: now,
        flag: "risk",
        weight: "high",
        rawScore: prob,
      }];
    }

    if (prob >= 0.45) {
      return [{
        key: "image_authenticity",
        value: `${Math.round(prob * 100)}% AI-generated likelihood`,
        confidence: prob,
        sourceArtifactIds: [artifactId],
        sourceModality: "image",
        extractor: this.agentId,
        rationale: "Image shows some synthetic generation indicators.",
        timestamp: now,
        flag: "neutral",
        weight: "high",
        rawScore: prob,
      }];
    }

    return [{
      key: "image_authenticity",
      value: `${Math.round(prob * 100)}% AI-generated likelihood`,
      confidence: 1 - prob,
      sourceArtifactIds: [artifactId],
      sourceModality: "image",
      extractor: this.agentId,
      rationale: "Image appears consistent with real photography.",
      timestamp: now,
      flag: "clean",
      weight: "high",
      rawScore: prob,
    }];
  }
}

export const imageAnalysisAgent = new ImageAnalysisAgent();
