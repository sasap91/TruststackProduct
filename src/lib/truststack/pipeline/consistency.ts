/**
 * TrustStack pipeline — Step 4: check_consistency()
 *
 * Model: claude-sonnet-4-6
 * Always runs. Cross-checks all prior signals for internal consistency.
 * Returns ConsistencySignals.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PipelineClaimInput, ClassifierOutput } from "../types/claim";
import type { VisualSignals, TextSignals, ConsistencySignals } from "../types/signals";

const MODEL = "claude-sonnet-4-6" as const;

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
  visual: VisualSignals,
  text: TextSignals,
): string {
  const visualSummary = visual.skipped
    ? "Visual analysis: SKIPPED (claim type or no photos)"
    : `Visual analysis:
  aiGeneratedPhotoDetected : ${visual.aiGeneratedPhotoDetected}
  photoMatchesDescription  : ${visual.photoMatchesDescription}
  damageVisible            : ${visual.damageVisible}
  suspiciousElements       : ${visual.suspiciousElements.length > 0 ? visual.suspiciousElements.join("; ") : "none"}
  rawAssessment            : ${visual.rawAssessment}`;

  const redFlagsSummary = text.redFlags.length > 0
    ? text.redFlags.join("; ")
    : "none";

  return `\
You are a consistency auditor for e-commerce dispute claims. Your role is to cross-check the outputs of the classifier, visual analysis, and text analysis and identify any conflicts or inconsistencies.

Claim context:
  Product       : ${input.productTitle} (SKU: ${input.productSku})
  Order date    : ${input.orderDate}
  Claim date    : ${input.claimDate}
  Description   : ${input.claimDescription}

Classifier output:
  claimType     : ${classifier.claimType}
  confidence    : ${classifier.confidence.toFixed(2)}
  reasoning     : ${classifier.reasoning}

${visualSummary}

Text analysis:
  claimsConsistentWithType : ${text.claimsConsistentWithType}
  timelineAnomaly          : ${text.timelineAnomaly}
  highValueLanguage        : ${text.highValueLanguage}
  evidenceDocumentsPresent : ${text.evidenceDocumentsPresent}
  redFlags                 : ${redFlagsSummary}

Evaluate:
1. score — A consistency score 0.0–1.0 where 1.0 = fully consistent across all signals and 0.0 = maximally inconsistent.
2. crossSignalConflicts — Specific conflicts between signals (e.g. "classifier says never_arrived but visual shows product with damage", "text claims immediate damage but claimDate is 25 days after orderDate"). Empty array if none.
3. timelineConsistent — Are the dates and event sequence consistent?
4. narrativeCoherent — Does the overall narrative hold together across all signals?
5. rawAssessment — A 2–3 sentence plain-English summary of your consistency findings.

Return ONLY a valid JSON object with no additional text or markdown:
{
  "score": <number 0.0–1.0>,
  "crossSignalConflicts": ["<string>", ...],
  "timelineConsistent": <true|false>,
  "narrativeCoherent": <true|false>,
  "rawAssessment": "<string>"
}`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function parseConsistencyResponse(text: string): ConsistencySignals {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Consistency: no JSON object found in response");

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const score = parsed["score"];
  if (typeof score !== "number" || score < 0 || score > 1) {
    throw new Error(`Consistency: invalid score "${String(score)}"`);
  }

  const bool = (key: string): boolean => {
    const v = parsed[key];
    if (typeof v !== "boolean") throw new Error(`Consistency: "${key}" must be boolean`);
    return v;
  };

  const conflicts = parsed["crossSignalConflicts"];

  return {
    score,
    crossSignalConflicts: Array.isArray(conflicts)
      ? conflicts.filter((c): c is string => typeof c === "string")
      : [],
    timelineConsistent: bool("timelineConsistent"),
    narrativeCoherent:  bool("narrativeCoherent"),
    rawAssessment:      typeof parsed["rawAssessment"] === "string" ? parsed["rawAssessment"] : "",
  };
}

// ── LLM call ─────────────────────────────────────────────────────────────────

export async function check_consistency(
  input: PipelineClaimInput,
  classifier: ClassifierOutput,
  visual: VisualSignals,
  text: TextSignals,
): Promise<ConsistencySignals> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 512,
    messages:   [{ role: "user", content: buildPrompt(input, classifier, visual, text) }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Consistency: unexpected response content type");

  return parseConsistencyResponse(block.text);
}
