/**
 * TrustStack pipeline — Step 1: classify_claim()
 *
 * Model: claude-haiku-4-5-20251001
 * Always runs. Returns ClaimType enum value + confidence.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PipelineClaimType } from "../types/claim";
import type { PipelineClaimInput, ClassifierOutput } from "../types/claim";

const MODEL = "claude-haiku-4-5-20251001" as const;

const VALID_CLAIM_TYPES = new Set<string>(Object.values(PipelineClaimType));

const PROMPT = (input: PipelineClaimInput) => `\
You are an e-commerce dispute classifier. Given a customer claim, classify it into exactly one of these 8 types:

  low_quality_product   — item is real but performs poorly or is not fit for purpose
  counterfeit_product   — item is suspected to be fake, replicated, or misrepresented
  never_arrived         — item was never delivered; no proof of receipt
  wrong_item            — wrong product, size, colour, model, or SKU was delivered
  damaged_in_transit    — item arrived physically damaged during shipping
  warranty_dispute      — item failed within the warranty period
  chargeback            — payment dispute or unauthorized charge
  marketplace_seller    — dispute with a third-party seller on a marketplace

Claim details:
  Product title : ${input.productTitle}
  Product SKU   : ${input.productSku}
  Description   : ${input.claimDescription}

Return ONLY a valid JSON object with no additional text or markdown:
{
  "claimType": "<one of the 8 types above>",
  "confidence": <number 0.0–1.0>,
  "reasoning": "<one concise sentence explaining why>"
}`;

// ── JSON extraction ───────────────────────────────────────────────────────────

function parseClassifierResponse(text: string): ClassifierOutput {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("Classifier: no JSON object found in response");

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const claimType = parsed["claimType"];
  if (typeof claimType !== "string" || !VALID_CLAIM_TYPES.has(claimType)) {
    throw new Error(`Classifier: invalid claimType "${String(claimType)}"`);
  }

  const confidence = parsed["confidence"];
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    throw new Error(`Classifier: invalid confidence "${String(confidence)}"`);
  }

  const reasoning = parsed["reasoning"];
  if (typeof reasoning !== "string") {
    throw new Error("Classifier: reasoning must be a string");
  }

  return {
    claimType:  claimType as PipelineClaimType,
    confidence,
    reasoning,
  };
}

// ── LLM call ─────────────────────────────────────────────────────────────────

export async function classify_claim(input: PipelineClaimInput): Promise<ClassifierOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 256,
    messages:   [{ role: "user", content: PROMPT(input) }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Classifier: unexpected response content type");

  return parseClassifierResponse(block.text);
}
