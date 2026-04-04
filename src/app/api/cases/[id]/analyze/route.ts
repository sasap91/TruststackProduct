/**
 * POST /api/cases/:id/analyze
 *
 * Async analysis trigger. Returns 202 immediately; the orchestrator runs in
 * the background (setImmediate — standalone/Node deployment).
 *
 * Response 202:
 *   { status: "processing", caseId: string, pollUrl: string }
 *
 * Poll GET /api/cases/:id/status for completion.
 * On completion a webhook is fired to all subscribed endpoints:
 *   event "analysis.completed" — full decision payload
 *   event "analysis.failed"    — { error: string }
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
 */

import { NextResponse }      from "next/server";
import { resolveUserId }     from "@/lib/apikey-auth";
import { checkRateLimit }    from "@/lib/ratelimit";
import { db }                from "@/lib/db";
import { claimOrchestrator } from "@/lib/truststack";
import { buildClaimResponse } from "@/lib/truststack/api";
import { dbCaseToClaimCase, updateCaseWithRun } from "@/lib/case-storage";
import { ApiError, withErrorHandling } from "@/lib/api-validate";
import type { PolicyConfig, DecisionRun } from "@/lib/truststack";
import { executeActions, type ActionExecutorContext } from "@/lib/truststack/executor";
import { dispatchWebhook } from "@/lib/truststack/webhook-dispatcher";

export const runtime     = "nodejs";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExecutorContext(
  run:     DecisionRun,
  caseRef: string,
  userId:  string,
): ActionExecutorContext {
  return {
    caseRef,
    claimDescription:   run.justification ?? "",
    riskLevel:          run.riskAssessment?.riskLevel ?? "low",
    riskScore:          run.riskAssessment?.consistencyScore ?? 0,
    outcome:            run.policyDecision?.outcome ?? "review",
    triggeredRules:     run.policyDecision?.matchedRules.filter((r) => r.triggered).map((r) => r.detail) ?? [],
    evidenceReferences: [],
    contradictions:     run.fusionResult?.contradictions ?? [],
    evidenceStrength:   run.fusionResult?.evidenceStrength ?? "insufficient",
    modalitiesCovered:  run.fusionResult?.modalitiesCovered ?? [],
    userId,
  };
}

/**
 * Full analysis pipeline — runs in background after 202 is returned.
 * Handles its own error reporting so no exception escapes to the caller.
 */
async function runAnalysisBackground(
  caseId:       string,
  userId:       string,
  caseRef:      string,
  policyConfig: PolicyConfig,
): Promise<void> {
  let claimCase;

  try {
    // Re-load the case inside the background job (fresh snapshot)
    const dbCase = await db.case.findFirst({
      where:   { id: caseId, userId },
      include: { evidence: true },
    });
    if (!dbCase) return; // case deleted between accept and execution

    claimCase = dbCaseToClaimCase(dbCase);

    const { run } = await claimOrchestrator.run({
      claimCase,
      mediaBuffers: undefined,
      policyConfig,
      triggeredBy:  userId,
    });

    // Persist results + execute autonomous actions
    await updateCaseWithRun(caseId, run, claimCase, userId);
    await executeActions(caseId, run.actions, buildExecutorContext(run, caseRef, userId));

    // Fire webhook: analysis.completed
    const response = buildClaimResponse(run, caseRef);
    await dispatchWebhook(caseId, "analysis.completed", response as unknown as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[analyze] Background analysis failed for case ${caseId}:`, err);

    // Revert case from ANALYZING → OPEN + log failure event
    await db.case.update({
      where: { id: caseId },
      data: {
        status:    "OPEN",
        updatedAt: new Date(),
        events: {
          create: {
            actor:   "system",
            type:    "analysis_failed",
            payload: { error: message },
          },
        },
      },
    }).catch(() => null);

    // Fire webhook: analysis.failed
    await dispatchWebhook(caseId, "analysis.failed", { error: message });
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const POST = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const allowed = await checkRateLimit(userId, "/api/cases/analyze");
  if (!allowed) throw new ApiError(429, "Rate limit exceeded. Max 20 requests per minute.");

  const { id: caseId } = await params;

  // ── Load case ───────────────────────────────────────────────────────────────
  const dbCase = await db.case.findFirst({
    where:   { id: caseId, userId },
    include: { evidence: true },
  });
  if (!dbCase) throw new ApiError(404, "Case not found.");
  if (dbCase.status === "APPROVED" || dbCase.status === "REJECTED") {
    throw new ApiError(409, "Case is already resolved.");
  }
  if (dbCase.status === "ANALYZING") {
    // Already in-flight — return 202 idempotently so callers can retry safely
    return NextResponse.json(
      { status: "processing", caseId, pollUrl: `/api/cases/${caseId}/status` },
      { status: 202 },
    );
  }

  // ── Parse optional policy config ────────────────────────────────────────────
  let policyConfig: PolicyConfig = {};
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.policyConfig && typeof body.policyConfig === "object") {
    policyConfig = body.policyConfig as PolicyConfig;
  }

  // ── Transition to ANALYZING ─────────────────────────────────────────────────
  await db.case.update({
    where: { id: caseId },
    data:  { status: "ANALYZING", updatedAt: new Date() },
  });

  // ── Kick off background analysis (setImmediate = next tick, non-blocking) ───
  // Standalone/Docker deployment — setImmediate keeps the event loop alive
  // until the async work completes after the HTTP response is flushed.
  setImmediate(() => {
    void runAnalysisBackground(caseId, userId, dbCase.ref, policyConfig);
  });

  // ── Return 202 immediately ──────────────────────────────────────────────────
  return NextResponse.json(
    { status: "processing", caseId, pollUrl: `/api/cases/${caseId}/status` },
    { status: 202 },
  );
});
