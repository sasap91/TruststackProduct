import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/apikey-auth";
import { runTextDetection, type TextDetectionModel } from "@/lib/detection/run";
import { checkRateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CHARS = 8000;

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowed = await checkRateLimit(userId, "/api/analyze/text");
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Max 20 requests per minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required." }, { status: 400 });
  }

  const parsed = body as { text?: unknown; model?: unknown };
  const text = typeof parsed.text === "string" ? parsed.text : "";
  const model: TextDetectionModel =
    parsed.model === "openai-moderation" ? "openai-moderation" : "huggingface";

  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_CHARS} characters).` },
      { status: 413 },
    );
  }

  const result = await runTextDetection(text, model);

  db.case.create({
    data: {
      ref: `TS-${new Date().getFullYear()}-${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`,
      userId,
      status: "APPROVED",
      description: text.slice(0, 1000),
      evidence: {
        create: [{
          type: "TEXT",
          rawText: text.slice(0, 1000),
          agentName: "text-ai-agent",
          agentModel: result.modelId,
          agentSource: result.source,
          rawScore: result.aiProbability,
          agentNotes: result.notes ?? [],
        }],
      },
    },
  }).catch(() => null);

  return NextResponse.json(result);
}
