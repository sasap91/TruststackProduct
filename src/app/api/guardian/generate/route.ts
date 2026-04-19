import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/guardian/image-gen";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { prompt } = (await request.json()) as { prompt?: string };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    }

    const { dataUrl } = await generateImage(prompt.trim());
    return NextResponse.json({ dataUrl }, { status: 200 });
  } catch (err) {
    console.error("[guardian/generate] error:", err);
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }
}
