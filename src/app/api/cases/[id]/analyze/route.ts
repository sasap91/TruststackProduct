/**
 * POST /api/cases/:id/analyze
 *
 * Trigger analysis on an existing case. Loads all stored evidence artifacts,
 * runs the MultimodalClaimOrchestrator, persists results, and returns the
 * full ClaimAnalysisResponse.
 *
 * Note: Binary artifacts (images) require their bytes to be available.
 * Until object-storage retrieval is wired up, image artifacts stored by
 * POST /api/cases/:id/evidence without inline content will be skipped;
 * their evidence step will be marked "skipped" in the audit trail.
 *
 * Request body (JSON, optional):
 *   policyConfig?: {
 *     autoApproveBelow?: number
 *     autoRejectAbove?: number
 *     lateFilingHours?: number
 *     highRefundRateThreshold?: number
 *     requireVideoForHighValue?: boolean
 *     policyPackId?: "standard" | "strict" | "lenient"
 *     customPolicyNotes?: string
 *   }
 *
 * Response 200: ClaimAnalysisResponse
 */

import { NextResponse }         from "next/server";
import { resolveUserId }        from "@/lib/apikey-auth";
import { checkRateLimit }       from "@/lib/ratelimit";
import { db }                   from "@/lib/db";
import { claimOrchestrator }    from "@/lib/truststack";
import { buildClaimResponse }   from "@/lib/truststack/api";
import { dbCaseToClaimCase, updateCaseWithRun } from "@/lib/case-storage";
import { ApiError, withErrorHandling } from "@/lib/api-validate";
import type { PolicyConfig }    from "@/lib/truststack";

export const runtime     = "nodejs";
export const maxDuration = 60;

export const POST = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const allowed = await checkRateLimit(userId, "/api/cases/analyze");
  if (!allowed) throw new ApiError(429, "Rate limit exceeded. Max 20 requests per minute.");

  const { id: caseId } = await params;

  // ── Load case + evidence from DB ──────────────────────────────────────────
  const dbCase = await db.case.findFirst({
    where:   { id: caseId, userId },
    include: { evidence: true },
  });
  if (!dbCase) throw new ApiError(404, "Case not found.");
  if (dbCase.status === "APPROVED" || dbCase.status === "REJECTED") {
    throw new ApiError(409, "Case is already resolved.");
  }

  // ── Parse optional policy config ──────────────────────────────────────────
  let policyConfig: PolicyConfig = {};
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.policyConfig && typeof body.policyConfig === "object") {
    policyConfig = body.policyConfig as PolicyConfig;
  }

  // ── Rebuild ClaimCase in memory ───────────────────────────────────────────
  const claimCase = dbCaseToClaimCase(dbCase);

  // Mark case as ANALYZING
  await db.case.update({
    where: { id: caseId },
    data:  { status: "ANALYZING", updatedAt: new Date() },
  });

  // ── Orchestrate ───────────────────────────────────────────────────────────
  // Binary media buffers: in production these come from object storage.
  // Currently not wired — image artifacts from prior uploads will be skipped
  // with a clear "skipped" step in the audit trail.
  const { run } = await claimOrchestrator.run({
    claimCase,
    mediaBuffers: undefined, // TODO: retrieve from object storage by storageRef
    policyConfig,
    triggeredBy: userId,
  });

  // ── Persist results (background) ──────────────────────────────────────────
  updateCaseWithRun(caseId, run, claimCase, userId).catch(() => null);

  // ── Respond ───────────────────────────────────────────────────────────────
  const response = buildClaimResponse(run, dbCase.ref);
  return NextResponse.json(response);
});
