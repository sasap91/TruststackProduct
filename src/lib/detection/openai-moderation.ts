import OpenAI from "openai";
import type { DetectionResult } from "./types";

export function getOpenAiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

/**
 * Uses OpenAI's omni-moderation-latest model to assess claim text.
 *
 * The moderation API scores content across safety categories.
 * For claim fraud, the most relevant signal is the `illicit` category,
 * which captures deceptive, scam, and fraudulent language patterns.
 *
 * The returned `aiProbability` is a blended risk score derived from:
 *   - illicit score (primary, 60% weight)
 *   - harassment/threatening score (10%)
 *   - violence score (10%)
 *   - overall flagged status bonus (20% cap)
 *
 * Categories and their claim-fraud relevance are listed in `notes`.
 */
export async function inferTextOpenAiModeration(text: string): Promise<DetectionResult> {
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    return {
      aiProbability: 0,
      source: "demo",
      modelId: "omni-moderation-latest",
      notes: ["OPENAI_API_KEY not configured — add it to .env.local to enable this model."],
    };
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = response.results[0];
    if (!result) {
      return {
        aiProbability: 0,
        source: "openai-moderation",
        modelId: "omni-moderation-latest",
        notes: ["No result returned from moderation API."],
      };
    }

    const scores = result.category_scores as unknown as Record<string, number>;

    // Derive a blended fraud-risk score from the most relevant categories
    const illicit = scores["illicit"] ?? 0;
    const illicitViolent = scores["illicit/violent"] ?? 0;
    const harassment = scores["harassment"] ?? 0;
    const harassmentThreatening = scores["harassment/threatening"] ?? 0;
    const violence = scores["violence"] ?? 0;
    const flaggedBonus = result.flagged ? 0.15 : 0;

    const blended = Math.min(
      1,
      illicit * 0.45 +
        illicitViolent * 0.15 +
        harassment * 0.10 +
        harassmentThreatening * 0.10 +
        violence * 0.05 +
        flaggedBonus,
    );

    // Surface the top triggered categories as notes
    const triggered = Object.entries(result.categories as unknown as Record<string, boolean>)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const topScores = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
      .join(", ");

    const notes: string[] = [
      `Top category scores — ${topScores}.`,
      ...(triggered.length
        ? [`Flagged categories: ${triggered.join(", ")}.`]
        : ["No categories triggered above threshold."]),
      "Score reflects fraud/deception risk, not just AI authorship.",
    ];

    return {
      aiProbability: blended,
      source: "openai-moderation",
      modelId: "omni-moderation-latest",
      notes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      aiProbability: 0,
      source: "demo",
      modelId: "omni-moderation-latest",
      notes: [`OpenAI Moderation API error: ${msg}`],
    };
  }
}
