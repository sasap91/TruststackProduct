import OpenAI from "openai";
import type { GuardianInput, ScreenerOutput, ExtractorOutput } from "./types";

const SYSTEM_PROMPT = `You are a visual IP and brand safety analyst for TrustStack Guardian.

Your job: extract ALL signals from the provided content that could constitute
IP infringement, brand safety violations, or legal exposure. Be thorough —
a miss is legally costly and worse than a false positive.

Check for ALL of the following:

IP CHARACTERS — any recognisable fictional character owned by a rights holder:
Disney, Marvel, DC, Nintendo, Pixar, DreamWorks, Studio Ghibli, Pokémon,
Harry Potter, Star Wars, Hello Kitty, Sanrio, and all other major franchises.

REAL PEOPLE — do NOT name them. Describe visual characteristics only.
Note "appears to depict a real person" without identification.

BRAND LOGOS / TRADEMARKS — any visible brand mark, wordmark, or symbol.
Even partially visible logos count.

STYLE MIMICRY — content that closely reproduces the distinctive style of
a specific named artist. Only flag when mimicry is specific and identifiable.

SAFETY SIGNALS — flag any visual signals of:
- Deepfake/impersonation: imagery designed to make a real person appear to
  say or do something fabricated
- Non-consensual intimate imagery (NCII)
- Fake official documents, fake currency, fake financial instruments
- Election manipulation or fake political endorsements
- Medical misinformation imagery
- Animal cruelty depictions

Output ONLY valid JSON matching this exact schema:
{
  "ipCharacters": [{"description": string, "ipHolder": string, "confidence": number}],
  "realPeople": [{"visualDescription": string, "confidence": number}],
  "brandLogos": [{"brand": string, "locationInImage": string, "confidence": number}],
  "styleMimicry": [{"artistDescription": string, "confidence": number}],
  "overallRisk": "low | medium | high | critical",
  "riskSummary": string
}

Return empty arrays for categories with no findings.`;

export async function extractSignals(
  input: GuardianInput,
  screenerOutput: ScreenerOutput
): Promise<ExtractorOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ipCharacters: [],
      realPeople: [],
      brandLogos: [],
      styleMimicry: [],
      overallRisk: "low",
      riskSummary: "No API key — extractor skipped (demo mode).",
    };
  }

  const promptContext = screenerOutput.repairedPrompt ?? input.textPrompt ?? "";
  const contextText = promptContext.trim()
    ? `Prompt context: ${promptContext}`
    : "No text prompt provided. Analyse the image only.";

  type UserContentPart = OpenAI.Chat.ChatCompletionContentPartText | OpenAI.Chat.ChatCompletionContentPartImage;
  const userContent: UserContentPart[] = [];

  if (input.imageBase64 && input.imageMediaType) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${input.imageMediaType};base64,${input.imageBase64}`,
      },
    });
  }

  userContent.push({ type: "text", text: contextText });

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const text = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(text) as ExtractorOutput;
  return parsed;
}
