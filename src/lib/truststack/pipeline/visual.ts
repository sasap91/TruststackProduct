/**
 * TrustStack pipeline — Step 2: extract_visual()
 *
 * Model: claude-opus-4-6
 * SKIPPED when:
 *   • claim type is never_arrived or chargeback
 *   • input.photoUrls is empty
 * Returns a VisualSignals object with skipped=true when skipped.
 *
 * When running, fetches each photo URL, encodes to base64, and passes
 * to Claude as a multimodal message.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PipelineClaimType } from "../types/claim";
import type { PipelineClaimInput, ClassifierOutput } from "../types/claim";
import type { VisualSignals } from "../types/signals";

const MODEL = "claude-opus-4-6" as const;

const SKIP_TYPES = new Set<PipelineClaimType>([
  PipelineClaimType.never_arrived,
  PipelineClaimType.chargeback,
]);

// ── Skipped sentinel ──────────────────────────────────────────────────────────

export const VISUAL_SKIPPED: VisualSignals = {
  skipped:                  true,
  aiGeneratedPhotoDetected: false,
  photoMatchesDescription:  null,
  damageVisible:            null,
  suspiciousElements:       [],
  rawAssessment:            "",
};

// ── Skip predicate ────────────────────────────────────────────────────────────

export function shouldSkipVisual(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
): boolean {
  if (input.photoUrls.length === 0) return true;
  if (SKIP_TYPES.has(classifier.claimType)) return true;
  return false;
}

// ── Image fetching ────────────────────────────────────────────────────────────

async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Visual: failed to fetch image (${response.status}): ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const ct = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim().toLowerCase();
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";
  if (ct === "image/png")  mediaType = "image/png";
  if (ct === "image/webp") mediaType = "image/webp";
  if (ct === "image/gif")  mediaType = "image/gif";

  return { base64, mediaType };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT = (input: PipelineClaimInput, classifier: ClassifierOutput) => `\
You are a visual evidence analyst for e-commerce dispute claims. Analyse the submitted photo(s) and return a structured assessment.

Claim context:
  Product       : ${input.productTitle} (SKU: ${input.productSku})
  Claim type    : ${classifier.claimType}
  Description   : ${input.claimDescription}

Evaluate:
1. aiGeneratedPhotoDetected — Is any photo AI-generated, synthetically produced, or digitally fabricated?
2. photoMatchesDescription — Does the visual content match what the customer described?
3. damageVisible — Is physical damage or defect clearly visible?
4. suspiciousElements — List any suspicious visual elements (staged scenes, mismatched lighting, inconsistent backgrounds, digital editing artefacts, etc.). Empty array if none.
5. rawAssessment — A 2-3 sentence plain-English summary of your findings.

Return ONLY a valid JSON object with no additional text or markdown:
{
  "aiGeneratedPhotoDetected": <true|false>,
  "photoMatchesDescription": <true|false>,
  "damageVisible": <true|false>,
  "suspiciousElements": ["<string>", ...],
  "rawAssessment": "<string>"
}`;

// ── JSON extraction ───────────────────────────────────────────────────────────

function parseVisualResponse(text: string): Omit<VisualSignals, "skipped"> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Visual: no JSON object found in response");

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const boolField = (key: string): boolean => {
    const v = parsed[key];
    if (typeof v !== "boolean") throw new Error(`Visual: "${key}" must be boolean, got ${typeof v}`);
    return v;
  };

  const suspiciousElements = parsed["suspiciousElements"];
  if (!Array.isArray(suspiciousElements)) {
    throw new Error("Visual: suspiciousElements must be an array");
  }

  return {
    aiGeneratedPhotoDetected: boolField("aiGeneratedPhotoDetected"),
    photoMatchesDescription:  boolField("photoMatchesDescription"),
    damageVisible:            boolField("damageVisible"),
    suspiciousElements:       suspiciousElements.filter((e): e is string => typeof e === "string"),
    rawAssessment:            typeof parsed["rawAssessment"] === "string" ? parsed["rawAssessment"] : "",
  };
}

// ── LLM call ─────────────────────────────────────────────────────────────────

export async function extract_visual(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
): Promise<VisualSignals> {
  if (shouldSkipVisual(input, classifier)) return VISUAL_SKIPPED;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  // Fetch and encode all photos (cap at 5 to avoid token limits)
  const photoUrls = input.photoUrls.slice(0, 5);
  const images = await Promise.all(photoUrls.map(fetchImageAsBase64));

  const imageBlocks: Anthropic.ImageBlockParam[] = images.map(({ base64, mediaType }) => ({
    type:   "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  }));

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 512,
    messages: [
      {
        role:    "user",
        content: [
          ...imageBlocks,
          { type: "text", text: PROMPT(input, classifier) },
        ],
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Visual: unexpected response content type");

  return { skipped: false, ...parseVisualResponse(block.text) };
}
