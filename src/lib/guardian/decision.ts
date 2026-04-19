import OpenAI from "openai";
import type { GuardianInput, ScreenerOutput, ExtractorOutput, DecisionOutput } from "./types";

const SYSTEM_PROMPT = `You are the compliance decision engine for TrustStack Guardian.

You receive the full compliance context: original input, screener findings,
and extracted visual signals. Apply the brand rules to produce a final
compliance decision.

DECISION CRITERIA:

BLOCKED (hard violations — always block):
- Any confirmed IP character with confidence > 0.5
- Any confirmed brand logo with confidence > 0.6
- Any real person likeness with confidence > 0.6
- Overall risk rated "critical"
- Screener verdict was "hard_block"

REVIEW (ambiguous — flag for human):
- IP character with confidence 0.3–0.5
- Style mimicry with confidence > 0.7
- Overall risk rated "high"

APPROVED:
- No signals above thresholds
- All signals below 0.3 confidence
- Screener verdict was "clean" and extractor found no issues

You must always provide a "reasoning" field explaining your decision in
plain language that a non-technical brand manager can read. When blocking,
explicitly name the IP issue (e.g. which character, franchise, or trademark
is protected and why using it creates legal risk).
You must always provide a "recommendedAction" field with a concrete next step.
When the verdict is "blocked" or "review", you must provide "suggestedPrompts":
3 alternative free-to-use prompt rewrites that preserve the creative intent
but remove all IP risk. Each suggested prompt should be ready to use as-is.

Output ONLY valid JSON matching this exact schema:
{
  "verdict": "approved | blocked | review",
  "confidence": number (0.0–1.0),
  "rulesFired": [{"ruleId": string, "ruleName": string, "triggeredBy": string, "severity": "hard | soft"}],
  "violations": [{"type": string, "description": string, "severity": "hard | soft", "confidence": number}],
  "safeToPublish": boolean,
  "reasoning": string,
  "recommendedAction": string,
  "suggestedPrompts": string[]
}`;

export async function makeDecision(
  input: GuardianInput,
  screenerOutput: ScreenerOutput,
  extractorOutput: ExtractorOutput
): Promise<DecisionOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      verdict: "approved",
      confidence: 0.5,
      rulesFired: [],
      violations: [],
      safeToPublish: true,
      reasoning: "No API key — decision engine in demo mode. Defaulting to approved.",
      recommendedAction: "Configure OPENAI_API_KEY to enable compliance checking.",
    };
  }

  const decisionContext = {
    originalPrompt: input.textPrompt ?? null,
    promptWasRepaired: screenerOutput.repairedPrompt !== null,
    repairedPrompt: screenerOutput.repairedPrompt,
    screenerVerdict: screenerOutput.verdict,
    screenerRiskScore: screenerOutput.riskScore,
    extractorOutput,
    brandRules: input.brandRules ?? [],
  };

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(decisionContext, null, 2) },
    ],
  });

  const text = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(text) as DecisionOutput;
  return parsed;
}
