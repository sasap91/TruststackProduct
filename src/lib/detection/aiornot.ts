import type { DetectionResult } from "./types";

const ENDPOINT = "https://api.aiornot.com/v2/image/sync";

type AiOrNotResponse = {
  id: string;
  report: {
    ai_generated?: {
      verdict: "ai" | "human" | "unknown";
      /** confidence 0–1 that verdict is correct */
      confidence?: number;
      score?: number;
    };
  };
};

export function getAiOrNotKey(): string | undefined {
  return process.env.AIORNOT_API_KEY?.trim() || undefined;
}

export async function inferImageAiOrNot(
  bytes: ArrayBuffer,
  mime: string,
): Promise<DetectionResult> {
  const apiKey = getAiOrNotKey();
  if (!apiKey) {
    return {
      aiProbability: 0.5,
      source: "demo",
      notes: ["AIORNOT_API_KEY not configured."],
    };
  }

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), "image");
  // Only run the ai_generated report — skip deepfake/nsfw/quality to keep latency low
  form.append("only", "ai_generated");

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return {
        aiProbability: 0.5,
        source: "demo",
        notes: [`AI or Not API error ${res.status}: ${text}`],
      };
    }

    const data = (await res.json()) as AiOrNotResponse;
    const aiGen = data.report?.ai_generated;

    if (!aiGen) {
      return {
        aiProbability: 0.5,
        source: "demo",
        notes: ["AI or Not returned no ai_generated field."],
      };
    }

    // Derive a 0–1 probability from verdict + confidence
    const confidence = aiGen.confidence ?? aiGen.score ?? 0.8;
    let aiProbability: number;
    if (aiGen.verdict === "ai") {
      aiProbability = confidence;
    } else if (aiGen.verdict === "human") {
      aiProbability = 1 - confidence;
    } else {
      aiProbability = 0.5;
    }

    return {
      aiProbability,
      source: "huggingface", // reuse existing type; surfaced as provider name in UI
      modelId: "aiornot/ai-image-detector",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      aiProbability: 0.5,
      source: "demo",
      notes: [`AI or Not request failed: ${msg}`],
    };
  }
}
