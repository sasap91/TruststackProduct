import { InferenceClient } from "@huggingface/inference";
import type { DetectionResult } from "./types";

type LabelScore = { label: string; score: number };

/** Map classifier labels to a single "AI-like" probability. */
export function classificationToAiProbability(items: LabelScore[]): number {
  if (items.length === 0) return 0.5;

  const norm = (s: string) => s.toLowerCase();

  let fakeLike = 0;
  let realLike = 0;
  for (const { label, score } of items) {
    const l = norm(label);
    if (
      l.includes("fake") ||
      l.includes("gpt") ||
      l.includes("generated") ||
      l.includes("ai") ||
      l.includes("synthetic") ||
      l.includes("artificial") ||
      l === "label_1"
    ) {
      fakeLike = Math.max(fakeLike, score);
    }
    if (l.includes("real") || l.includes("human") || l.includes("natural") || l === "label_0") {
      realLike = Math.max(realLike, score);
    }
  }

  if (fakeLike > 0 && realLike > 0) {
    const s = fakeLike + realLike;
    return s > 0 ? fakeLike / s : 0.5;
  }
  if (fakeLike > 0) return fakeLike;
  if (realLike > 0) return 1 - realLike;

  const top = [...items].sort((a, b) => b.score - a.score)[0];
  return top?.score ?? 0.5;
}

export function getInferenceToken(): string | undefined {
  return process.env.HUGGINGFACE_ACCESS_TOKEN?.trim() || process.env.HF_TOKEN?.trim() || undefined;
}

export function createInferenceClient(): InferenceClient | null {
  const token = getInferenceToken();
  if (!token) return null;
  return new InferenceClient(token);
}

export async function inferImageClassification(
  client: InferenceClient,
  model: string,
  bytes: ArrayBuffer,
  mime?: string,
): Promise<DetectionResult> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime ?? "image/jpeg" });
  try {
    const out = await client.imageClassification({
      model,
      inputs: blob,
    });
    return {
      aiProbability: classificationToAiProbability(out),
      source: "huggingface",
      modelId: model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      aiProbability: 0.5,
      source: "huggingface",
      modelId: model,
      notes: [msg],
    };
  }
}

export async function inferTextClassification(
  client: InferenceClient,
  model: string,
  text: string,
): Promise<DetectionResult> {
  try {
    const out = await client.textClassification({
      model,
      inputs: text,
    });
    return {
      aiProbability: classificationToAiProbability(out),
      source: "huggingface",
      modelId: model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      aiProbability: 0.5,
      source: "huggingface",
      modelId: model,
      notes: [msg],
    };
  }
}
