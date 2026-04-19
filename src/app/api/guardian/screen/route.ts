import { NextRequest, NextResponse } from "next/server";
import { runGuardianPipeline } from "@/lib/guardian/orchestrator";
import type { GuardianInput } from "@/lib/guardian/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<GuardianInput>;

    if (!body.textPrompt && !body.imageBase64) {
      return NextResponse.json(
        { error: "At least one of textPrompt or imageBase64 must be provided." },
        { status: 400 }
      );
    }

    const input: GuardianInput = {
      mode: body.mode ?? (body.textPrompt && body.imageBase64 ? "both" : body.imageBase64 ? "image_upload" : "text_prompt"),
      textPrompt: body.textPrompt,
      imageBase64: body.imageBase64,
      imageMediaType: body.imageMediaType,
      brandRules: body.brandRules ?? [],
    };

    const result = await runGuardianPipeline(input);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[guardian/screen] error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
