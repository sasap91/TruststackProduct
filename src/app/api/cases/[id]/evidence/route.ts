/**
 * POST /api/cases/:id/evidence
 *
 * Attach an evidence artifact to an existing case.
 *
 * Accepts multipart form data for binary artifacts (image, document) or
 * JSON for inline artifacts (text, metadata).
 *
 * Multipart fields:
 *   file         (Blob)    — image or document binary
 *   type         (string)  — "IMAGE" | "DOCUMENT"
 *   mimeType     (string, optional)
 *
 * JSON body:
 *   { type: "TEXT" | "METADATA", content: string }
 *
 * Response 201:
 *   { artifactId, type, status }
 */

import { NextResponse }   from "next/server";
import { resolveUserId }  from "@/lib/apikey-auth";
import { db }             from "@/lib/db";
import { sniffImageMime } from "@/lib/image-mime";
import {
  ApiError,
  requireString,
  optionalString,
  withErrorHandling,
} from "@/lib/api-validate";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["IMAGE", "TEXT", "DOCUMENT", "METADATA", "ORDER_DATA"]);

export const POST = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const { id: caseId } = await params;

  // Verify case ownership
  const dbCase = await db.case.findFirst({
    where: { id: caseId, userId },
    select: { id: true, status: true },
  });
  if (!dbCase) throw new ApiError(404, "Case not found.");
  if (dbCase.status === "APPROVED" || dbCase.status === "REJECTED") {
    throw new ApiError(409, "Cannot add evidence to a resolved case.");
  }

  const contentType = request.headers.get("content-type") ?? "";

  // ── Multipart: binary artifact ─────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) throw new ApiError(400, "Invalid form data.");

    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      throw new ApiError(400, "Expected file field.");
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, `File too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
    }

    const rawType   = requireString(form.get("type"), "type").toUpperCase();
    if (!ALLOWED_TYPES.has(rawType)) {
      throw new ApiError(400, `type must be one of: ${[...ALLOWED_TYPES].join(", ")}.`);
    }

    const buffer    = await file.arrayBuffer();
    const mimeType  = optionalString(form.get("mimeType")) ?? (
      rawType === "IMAGE" ? sniffImageMime(buffer) ?? "application/octet-stream"
                          : (file as File).type || "application/octet-stream"
    );

    if (rawType === "IMAGE" && !sniffImageMime(buffer)) {
      throw new ApiError(415, "Unsupported image format. Use JPEG, PNG, GIF, or WebP.");
    }

    const artifact = await db.evidenceArtifact.create({
      data: {
        caseId,
        type:      rawType as any,
        mimeType,
        sizeBytes: buffer.byteLength,
        // Binary content stored in object storage in production
        // storageRef populated by upload handler; omitted here
      },
      select: { id: true, type: true },
    });

    await db.caseEvent.create({
      data: {
        caseId,
        actor:   userId,
        type:    "evidence_added",
        payload: { artifactId: artifact.id, evidenceType: rawType, mimeType },
      },
    });

    return NextResponse.json(
      { artifactId: artifact.id, type: artifact.type, status: "pending" },
      { status: 201 },
    );
  }

  // ── JSON: inline text / metadata artifact ─────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new ApiError(400, "Invalid JSON.");

    const rawType = requireString(body.type as string | null, "type").toUpperCase();
    if (rawType !== "TEXT" && rawType !== "METADATA" && rawType !== "ORDER_DATA") {
      throw new ApiError(400, "JSON evidence must be type TEXT, METADATA, or ORDER_DATA.");
    }

    const content = requireString(body.content as string | null, "content");

    const artifact = await db.evidenceArtifact.create({
      data: {
        caseId,
        type:    rawType as any,
        rawText: content.slice(0, 10_000),
      },
      select: { id: true, type: true },
    });

    await db.caseEvent.create({
      data: {
        caseId,
        actor:   userId,
        type:    "evidence_added",
        payload: { artifactId: artifact.id, evidenceType: rawType, charCount: content.length },
      },
    });

    return NextResponse.json(
      { artifactId: artifact.id, type: artifact.type, status: "pending" },
      { status: 201 },
    );
  }

  throw new ApiError(415, "Content-Type must be multipart/form-data or application/json.");
});
