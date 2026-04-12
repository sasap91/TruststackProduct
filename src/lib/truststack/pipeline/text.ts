/**
 * TrustStack pipeline — Step 3: extract_text()
 *
 * Model: claude-haiku-4-5-20251001
 * Always runs. Analyses the claim description and evidence document stubs.
 * Returns TextSignals.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PipelineClaimInput, ClassifierOutput } from "../types/claim";
import type { TextSignals, ParsedDocument } from "../types/signals";

const MODEL = "claude-haiku-4-5-20251001" as const;

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
  documents: ParsedDocument[],
): string {
  const docSummary = documents.length === 0
    ? "None provided."
    : documents.map((d, i) => `  [${i + 1}] type=${d.docType}, url=${d.url}`).join("\n");

  return `\
You are a text evidence analyst for e-commerce dispute claims. Analyse the claim description and attached evidence list.

Claim context:
  Product       : ${input.productTitle} (SKU: ${input.productSku})
  Claim type    : ${classifier.claimType} (confidence: ${classifier.confidence.toFixed(2)})
  Order date    : ${input.orderDate}
  Claim date    : ${input.claimDate}
  Order value   : ${input.orderValue} ${input.currency}
  Description   : ${input.claimDescription}

Evidence documents:
${docSummary}

Evaluate:
1. claimsConsistentWithType — Is the description consistent with the classified claim type?
2. timelineAnomaly — Are there internal inconsistencies in dates or the sequence of events?
3. highValueLanguage — Does the text contain language patterns associated with coached or escalated fraud (legal threats, formal demand language, "per my rights", etc.)?
4. evidenceDocumentsPresent — Were any evidence documents provided?
5. parsedDocuments — For each document, extract a short text summary and list any anomalies. Return the same URL and docType passed in.
6. redFlags — A list of specific red flags you identified (free text). Empty array if none.

Return ONLY a valid JSON object with no additional text or markdown:
{
  "claimsConsistentWithType": <true|false>,
  "timelineAnomaly": <true|false>,
  "highValueLanguage": <true|false>,
  "evidenceDocumentsPresent": <true|false>,
  "parsedDocuments": [
    {
      "url": "<string>",
      "docType": "<receipt|tracking|photo|correspondence|other>",
      "extractedText": "<short summary>",
      "anomalies": ["<string>", ...]
    }
  ],
  "redFlags": ["<string>", ...]
}`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

const VALID_DOC_TYPES = new Set(["receipt", "tracking", "photo", "correspondence", "other"]);

function parseTextResponse(text: string, fallbackDocs: ParsedDocument[]): TextSignals {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Text: no JSON object found in response");

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const bool = (key: string): boolean => {
    const v = parsed[key];
    if (typeof v !== "boolean") throw new Error(`Text: "${key}" must be boolean`);
    return v;
  };

  let parsedDocuments: ParsedDocument[] = fallbackDocs;
  const rawDocs = parsed["parsedDocuments"];
  if (Array.isArray(rawDocs)) {
    parsedDocuments = rawDocs
      .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
      .map((d) => ({
        url:           typeof d["url"] === "string" ? d["url"] : "",
        docType:       (typeof d["docType"] === "string" && VALID_DOC_TYPES.has(d["docType"] as string))
                         ? (d["docType"] as ParsedDocument["docType"])
                         : "other",
        extractedText: typeof d["extractedText"] === "string" ? d["extractedText"] : "",
        anomalies:     Array.isArray(d["anomalies"])
                         ? d["anomalies"].filter((a): a is string => typeof a === "string")
                         : [],
      }));
  }

  const redFlags = parsed["redFlags"];

  return {
    claimsConsistentWithType: bool("claimsConsistentWithType"),
    timelineAnomaly:          bool("timelineAnomaly"),
    highValueLanguage:        bool("highValueLanguage"),
    evidenceDocumentsPresent: bool("evidenceDocumentsPresent"),
    parsedDocuments,
    redFlags: Array.isArray(redFlags)
      ? redFlags.filter((f): f is string => typeof f === "string")
      : [],
  };
}

// ── LLM call ─────────────────────────────────────────────────────────────────

export async function extract_text(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
  documents: ParsedDocument[],
): Promise<TextSignals> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 1024,
    messages:   [{ role: "user", content: buildPrompt(input, classifier, documents) }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Text: unexpected response content type");

  return parseTextResponse(block.text, documents);
}
