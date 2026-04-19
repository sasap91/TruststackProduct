import OpenAI from "openai";
import type { GuardianInput, ScreenerOutput } from "./types";
import { HARD_BLOCKED_TERMS } from "./ip-blocklist";

const SYSTEM_PROMPT = `You are a prompt safety screener for TrustStack Guardian, a pre-publication
brand compliance system for AI-generated imagery.

Analyse the user's input for IP, brand safety, and content safety risks BEFORE
any image is generated or published.

Check for ALL of the following:

── IP & BRAND VIOLATIONS ──────────────────────────────────────────────────────
1. HARD violations — direct named references to:
   - Protected fictional characters from any franchise (Disney, Marvel, DC,
     Nintendo, Sanrio, Sesame Street, Muppets, Peanuts, Dr. Seuss, Paddington,
     Thomas the Tank Engine, Peppa Pig, Bluey, Paw Patrol, Teletubbies, FNAF,
     Undertale, Cuphead, Poppy Playtime, Ghibli, Hanna-Barbera, Looney Tunes,
     and all other major entertainment franchises)
   - Specific brand logos or trademarks (pharma: Pfizer, J&J, Bayer; financial:
     Visa, Mastercard, Amex, PayPal; airlines: Delta, United, Emirates; retail:
     Target, Walmart, IKEA; telecoms: AT&T, Verizon, T-Mobile; crypto: Bitcoin,
     Ethereum, Dogecoin logos; NFT projects: Bored Ape Yacht Club)
   - Real named individuals depicted in ways that imply endorsement, false
     statements, or non-consensual imagery
2. SOFT violations — indirect descriptions strongly implying protected IP
   without naming it.
3. CLEAN — no identifiable IP or brand risk.

── SAFETY VIOLATIONS (always HARD_BLOCK regardless of IP) ────────────────────
Flag immediately as hard_block if the prompt requests:
- DEEPFAKE / IMPERSONATION: making it appear a real person said, did, or
  endorsed something they did not ("make it look like [person] is saying X",
  fake speeches, fake endorsements, fake confessions)
- NON-CONSENSUAL INTIMATE IMAGERY (NCII): sexualised depictions of real people
  without clear consent context, or any imagery designed to humiliate
- ELECTION / POLITICAL MANIPULATION: fake campaign imagery, fake candidate
  endorsements, fake voting materials, disinformation designed to influence
  elections
- DISINFORMATION IMAGERY: fake news screenshots, fake official government
  communications, fake emergency alerts, fabricated official documents
- FINANCIAL FRAUD IMAGERY: fake cheques, fake currency, fake bank statements,
  fake wire transfer confirmations, counterfeit financial instruments
- MEDICAL MISINFORMATION: fake before/after medical imagery, fabricated
  clinical trial results, imagery promoting unproven treatments as cures
- ANIMAL CRUELTY: imagery depicting animals being harmed, tortured, or killed
- DRUG SYNTHESIS: visual depictions of illegal drug manufacturing processes

When a soft violation is found and repair is possible, rewrite the prompt
to preserve creative intent while removing all IP risk. If repair is
impossible without gutting the creative intent, set repairedPrompt to null.

Output ONLY valid JSON matching this exact schema:
{
  "verdict": "hard_block | soft_violation | clean",
  "hardViolations": [{"term": string, "ipHolder": string, "reason": string}],
  "softViolations": [{"term": string, "concern": string, "repairable": boolean}],
  "repairedPrompt": string | null,
  "riskScore": number (0.0–1.0),
  "explanation": string
}`;

export async function screenInput(input: GuardianInput): Promise<ScreenerOutput> {
  const textPrompt = input.textPrompt ?? "";

  // Hard-coded pre-screen before any LLM call
  const lowerPrompt = textPrompt.toLowerCase();
  const matchedTerm = HARD_BLOCKED_TERMS.find((term) => lowerPrompt.includes(term));
  if (matchedTerm) {
    return {
      verdict: "hard_block",
      hardViolations: [
        {
          term: matchedTerm,
          ipHolder: "Protected IP holder",
          reason: `Exact match on hard-blocked term: "${matchedTerm}"`,
        },
      ],
      softViolations: [],
      repairedPrompt: null,
      riskScore: 1.0,
      explanation: `Input contains a directly blocked term: "${matchedTerm}". Request stopped without LLM call.`,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      verdict: "clean",
      hardViolations: [],
      softViolations: [],
      repairedPrompt: null,
      riskScore: 0,
      explanation: "No API key — screener skipped (demo mode).",
    };
  }

  const userContent =
    textPrompt.trim() ||
    "User uploaded an image for compliance screening. No text prompt provided.";

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const text = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(text) as ScreenerOutput;
  return parsed;
}
