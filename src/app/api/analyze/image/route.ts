import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/apikey-auth";
import { runImageDetection } from "@/lib/detection/run";
import { sniffImageMime } from "@/lib/image-mime";
import { checkRateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowed = await checkRateLimit(userId, "/api/analyze/image");
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Max 20 requests per minute." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Expected file field (image)." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (max ${MAX_BYTES / (1024 * 1024)} MB).` },
      { status: 413 },
    );
  }

  const buffer = await file.arrayBuffer();
  const mime = sniffImageMime(buffer);
  if (!mime) {
    return NextResponse.json(
      { error: "Unsupported or invalid image. Use JPEG, PNG, GIF, or WebP." },
      { status: 415 },
    );
  }

  const result = await runImageDetection(buffer, mime);

  db.case.create({
    data: {
      ref: `TS-${new Date().getFullYear()}-${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`,
      userId,
      status: "APPROVED",
      evidence: {
        create: [{
          type: "IMAGE",
          mimeType: mime,
          sizeBytes: buffer.byteLength,
          agentName: "image-ai-agent",
          agentModel: result.modelId,
          agentSource: result.source,
          rawScore: result.aiProbability,
          agentNotes: result.notes ?? [],
        }],
      },
    },
  }).catch(() => null);

  return NextResponse.json({ ...result, mime });
}
