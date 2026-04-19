export interface GeneratedImage {
  b64: string;
  dataUrl: string;
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const apiKey = process.env.NUNCHAKU_API_KEY?.trim();
  if (!apiKey) throw new Error("NUNCHAKU_API_KEY is not set.");

  const res = await fetch("https://api.nunchaku.dev/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "nunchaku-qwen-image",
      prompt,
      n: 1,
      size: "1024x1024",
      tier: "radically_fast",
      num_inference_steps: 4,
      response_format: "b64_json",
      seed: Math.floor(Math.random() * 100000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nunchaku API error ${res.status}: ${err}`);
  }

  const json = await res.json() as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from Nunchaku API.");

  return { b64, dataUrl: `data:image/png;base64,${b64}` };
}
