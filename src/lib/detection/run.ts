import { demoProbabilityFromBytes, demoProbabilityFromText } from "./demo";
import {
  createInferenceClient,
  inferImageClassification,
  inferTextClassification,
} from "./huggingface";
import { getAiOrNotKey, inferImageAiOrNot } from "./aiornot";
import { getOpenAiKey, inferTextOpenAiModeration } from "./openai-moderation";
import type { DetectionResult } from "./types";

export type TextDetectionModel = "huggingface" | "openai-moderation";

const DEFAULT_IMAGE_MODEL = "umm-maybe/AI-image-detector";
const DEFAULT_TEXT_MODEL = "openai-community/roberta-base-openai-detector";

function imageModel(): string {
  return process.env.HF_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

function textModel(): string {
  return process.env.HF_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

export async function runImageDetection(bytes: ArrayBuffer, mime?: string): Promise<DetectionResult> {
  const resolvedMime = mime ?? "image/jpeg";

  // Prefer AI or Not when key is configured — more accurate than HF models
  if (getAiOrNotKey()) {
    return inferImageAiOrNot(bytes, resolvedMime);
  }

  const client = createInferenceClient();
  if (!client) {
    return {
      aiProbability: demoProbabilityFromBytes(bytes),
      source: "demo",
      notes: [
        "No detection provider configured. Add AIORNOT_API_KEY or HUGGINGFACE_ACCESS_TOKEN.",
      ],
    };
  }

  const model = imageModel();
  const hf = await inferImageClassification(client, model, bytes, resolvedMime);
  if (hf.notes?.length) {
    return {
      ...hf,
      aiProbability: demoProbabilityFromBytes(bytes),
      source: "demo",
      notes: [
        ...hf.notes,
        "Fell back to demo score after model error. Check HF_IMAGE_MODEL and provider access.",
      ],
    };
  }
  return hf;
}

export async function runTextDetection(
  text: string,
  model: TextDetectionModel = "huggingface",
): Promise<DetectionResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { aiProbability: 0, source: "demo", notes: ["Empty text."] };
  }

  if (model === "openai-moderation") {
    if (!getOpenAiKey()) {
      return {
        aiProbability: 0,
        source: "demo",
        modelId: "omni-moderation-latest",
        notes: ["OPENAI_API_KEY not configured — add it to .env.local to enable this model."],
      };
    }
    return inferTextOpenAiModeration(trimmed);
  }

  // Default: HuggingFace
  const client = createInferenceClient();
  if (!client) {
    return {
      aiProbability: demoProbabilityFromText(trimmed),
      source: "demo",
      notes: [
        "No Hugging Face token configured. Scores are deterministic placeholders for UI testing only — not real detection.",
      ],
    };
  }

  const hf = await inferTextClassification(client, textModel(), trimmed);
  if (hf.notes?.length) {
    return {
      ...hf,
      aiProbability: demoProbabilityFromText(trimmed),
      source: "demo",
      notes: [
        ...hf.notes,
        "Fell back to demo score after model error. Check HF_TEXT_MODEL and provider access.",
      ],
    };
  }
  return hf;
}
