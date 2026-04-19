import OpenAI from "openai";

export async function suggestAlternativePrompts(
  originalPrompt: string,
  blockReason: string
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return [];

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a creative director helping rewrite image generation prompts to remove IP violations.
Given a blocked prompt and the reason it was blocked, produce exactly 3 alternative prompts that:
- Preserve the same creative intent and visual concept
- Remove all references to protected IP, characters, brands, or real people
- Use generic, royalty-free descriptions instead
- Are ready to use as-is for image generation

Output ONLY valid JSON: { "suggestions": [string, string, string] }`,
      },
      {
        role: "user",
        content: `Original prompt: "${originalPrompt}"\nBlocked because: ${blockReason}`,
      },
    ],
  });

  const text = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(text) as { suggestions?: string[] };
  return parsed.suggestions ?? [];
}
