/**
 * TextAnalysisAgent
 *
 * Analyzes a text artifact for AI-generated or policy-violating content.
 * Supports multiple underlying models: HuggingFace RoBERTa (default)
 * and OpenAI omni-moderation (when OPENAI_API_KEY is configured).
 */

import type { Agent } from "./index";
import type { ArtifactAnalysis } from "../types/artifact";
import type { NormalizedSignal } from "../types/signal";
import { runTextDetection, type TextDetectionModel } from "@/lib/detection/run";

export type TextAgentInput = {
  artifactId: string;
  text: string;
  /** Override the underlying model. Defaults to "huggingface". */
  model?: TextDetectionModel;
};

export type TextAgentOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

export class TextAnalysisAgent implements Agent<TextAgentInput, TextAgentOutput> {
  readonly agentId = "text-ai-agent";
  readonly version = "1.0.0";

  async run(input: TextAgentInput): Promise<TextAgentOutput> {
    const { artifactId, text, model = "huggingface" } = input;
    const start = Date.now();

    const result = await runTextDetection(text, model);

    const provider = result.source === "openai-moderation" ? "openai-moderation"
                   : result.source === "demo"              ? "demo"
                   : "huggingface";

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId: this.agentId,
      modelId: result.modelId,
      provider,
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
        key: "text_authenticity",
        value: `${Math.round(prob * 100)}% AI-generated likelihood`,
        confidence: prob,
        sourceArtifactIds: [artifactId],
        sourceModality: "text",
        extractor: this.agentId,
        rationale: "Claim language patterns suggest machine-generated copy.",
        timestamp: now,
        flag: "risk",
        weight: "medium",
        rawScore: prob,
      }];
    }

    if (prob >= 0.45) {
      return [{
        key: "text_authenticity",
        value: `${Math.round(prob * 100)}% AI-generated likelihood`,
        confidence: prob,
        sourceArtifactIds: [artifactId],
        sourceModality: "text",
        extractor: this.agentId,
        timestamp: now,
        flag: "neutral",
        weight: "medium",
        rawScore: prob,
      }];
    }

    return [{
      key: "text_authenticity",
      value: `${Math.round(prob * 100)}% AI-generated likelihood`,
      confidence: 1 - prob,
      sourceArtifactIds: [artifactId],
      sourceModality: "text",
      extractor: this.agentId,
      timestamp: now,
      flag: "clean",
      weight: "medium",
      rawScore: prob,
    }];
  }
}

export const textAnalysisAgent = new TextAnalysisAgent();
