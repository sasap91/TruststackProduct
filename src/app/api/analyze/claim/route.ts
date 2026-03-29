/**
 * POST /api/analyze/claim
 *
 * Backwards-compatible multimodal claim analysis endpoint.
 * Accepts multipart form data, runs the full TrustStack pipeline, and returns
 * a structured ClaimAnalysisResponse.
 *
 * This route is intentionally thin: all business logic lives in
 * @/lib/truststack/api and @/lib/case-storage.
 *
 * Form fields:
 *   file                    (Blob, required)   — JPEG / PNG / GIF / WebP image
 *   claimText               (string, required) — free-text claim description
 *   claimType               (string)           — "damaged_item" | "not_received" | "wrong_item"
 *   deliveryStatus          (string)           — "delivered_intact" | "not_delivered" | "unknown"
 *   claimAgeHours           (number)
 *   highValue               (boolean string)
 *   refundRate              (number 0–1)
 *   hasVideoProof           (boolean string)
 *   imageAiRejectThreshold  (number 0–1)
 *   imageAiFlagThreshold    (number 0–1)
 *   textAiFlagThreshold     (number 0–1)
 *   highRefundRateThreshold (number 0–1)
 *   lateFilingHours         (number)
 *   requireVideoForHighValue (boolean string)
 *   customPolicyNotes       (string)
 */

import { NextResponse } from "next/server";
import { resolveUserId }  from "@/lib/apikey-auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { sniffImageMime } from "@/lib/image-mime";
import { db }             from "@/lib/db";
import { claimOrchestrator } from "@/lib/truststack";
import {
  buildClaimCase,
  buildClaimResponse,
  generateCaseRef,
} from "@/lib/truststack/api";
import { persistRunToDb }     from "@/lib/case-storage";
import {
  ApiError,
  optionalString,
  optionalFloat01,
  optionalPositiveNumber,
  optionalBoolean,
} from "@/lib/api-validate";
import type { PolicyConfig } from "@/lib/truststack";

export const runtime    = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const allowed = await checkRateLimit(userId, "/api/analyze/claim");
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 20 requests per minute." },
        { status: 429 },
      );
    }

    // ── Parse form ──────────────────────────────────────────────────────────
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
    }

    // Image (optional)
    let imageBuffer: ArrayBuffer | undefined;
    let imageMime:   string | undefined;
    const file = form.get("file");
    if (file instanceof Blob && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `Image too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
          { status: 413 },
        );
      }
      imageBuffer = await file.arrayBuffer();
      imageMime   = sniffImageMime(imageBuffer) ?? undefined;
      if (!imageMime) {
        return NextResponse.json(
          { error: "Unsupported or invalid image. Use JPEG, PNG, GIF, or WebP." },
          { status: 415 },
        );
      }
    }

    // Document (optional)
    let documentContent:  string | undefined;
    let documentFilename: string | undefined;
    const docField = form.get("document");
    if (docField instanceof Blob && docField.size > 0) {
      if (docField.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `Document too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
          { status: 413 },
        );
      }
      documentContent  = await docField.text();
      documentFilename = (docField as File).name || undefined;
    }

    // Claim text (required)
    const claimText = optionalString(form.get("claimText"));
    if (!claimText) {
      return NextResponse.json({ error: "claimText is required." }, { status: 400 });
    }

    // Policy config
    const policyConfig: PolicyConfig = {};
    const irt = optionalFloat01(form.get("imageAiRejectThreshold"));
    if (irt  !== undefined) policyConfig.imageAiRejectThreshold  = irt;
    const ift = optionalFloat01(form.get("imageAiFlagThreshold"));
    if (ift  !== undefined) policyConfig.imageAiFlagThreshold    = ift;
    const tft = optionalFloat01(form.get("textAiFlagThreshold"));
    if (tft  !== undefined) policyConfig.textAiFlagThreshold     = tft;
    const hrt = optionalFloat01(form.get("highRefundRateThreshold"));
    if (hrt  !== undefined) policyConfig.highRefundRateThreshold = hrt;
    const lh  = optionalPositiveNumber(form.get("lateFilingHours"));
    if (lh   !== undefined) policyConfig.lateFilingHours         = lh;
    const rvh = optionalBoolean(form.get("requireVideoForHighValue"));
    if (rvh  !== undefined) policyConfig.requireVideoForHighValue = rvh;
    const cpn = optionalString(form.get("customPolicyNotes"));
    if (cpn  !== undefined) policyConfig.customPolicyNotes       = cpn;

    // ── Build ClaimCase ─────────────────────────────────────────────────────
    const caseRef = generateCaseRef();
    const { claimCase, mediaBuffers } = buildClaimCase(
      {
        claimText,
        imageBuffer,
        imageMime,
        imageSizeBytes:  imageBuffer?.byteLength,
        documentContent,
        documentFilename,
        claimType:       optionalString(form.get("claimType")),
        deliveryStatus:  optionalString(form.get("deliveryStatus")),
        claimAgeHours:   optionalPositiveNumber(form.get("claimAgeHours")),
        highValue:       optionalBoolean(form.get("highValue")),
        refundRate:      optionalFloat01(form.get("refundRate")),
        hasVideoProof:   optionalBoolean(form.get("hasVideoProof")),
      },
      userId,
      caseRef,
    );

    // ── Orchestrate ─────────────────────────────────────────────────────────
    const { run } = await claimOrchestrator.run({
      claimCase,
      mediaBuffers,
      policyConfig,
      triggeredBy: userId,
    });

    // ── Persist (background, non-blocking) ─────────────────────────────────
    persistRunToDb(run, claimCase, userId, {
      imageMime,
      imageSizeBytes: imageBuffer?.byteLength,
    }).catch(() => null);

    // Usage record (also background)
    db.usageRecord
      .create({ data: { userId, endpoint: "/api/analyze/claim" } })
      .catch(() => null);

    // ── Respond ─────────────────────────────────────────────────────────────
    const response = buildClaimResponse(run, caseRef);
    return NextResponse.json(response);

  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[/api/analyze/claim]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
