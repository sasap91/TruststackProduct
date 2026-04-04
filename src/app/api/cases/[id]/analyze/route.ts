/**
 * POST /api/cases/:id/analyze
 *
 * Async analysis trigger. Returns 202 immediately; the orchestrator runs in
 * the background (setImmediate — standalone/Node deployment).
 *
 * Response 202:
 *   { status: "processing", caseId: string, pollUrl: string }
 *
 * Uses the iterative evidence-gathering loop (orchestrator-loop.ts):
 *   - Iterations 1–3: respects "request_more_evidence" → sets AWAITING_EVIDENCE
 *   - Iteration 4+: force-escalates to human review
 *   - Evidence timeout exceeded: auto-rejects
 *
 * Poll GET /api/cases/:id/status for completion.
 * On completion a webhook fires:
 *   event "analysis.completed" — full decision payload + awaiting_evidence flag
 *   event "analysis.failed"    — { error: string }
 */

import { NextResponse }       from "next/server";
import { resolveUserId }      from "@/lib/apikey-auth";
import { checkRateLimit }     from "@/lib/ratelimit";
import { db }                 from "@/lib/db";
import { buildClaimResponse } from "@/lib/truststack/api";
import { dbCaseToClaimCase, updateCaseWithRun } from "@/lib/case-storage";
import { ApiError, withErrorHandling } from "@/lib/api-validate";
import type { PolicyConfig, DecisionRun } from "@/lib/truststack";
import { executeActions, type ActionExecutorContext } from "@/lib/truststack/executor";
import { dispatchWebhook } from "@/lib/truststack/webhook-dispatcher";
import { runWithLoop, type PreviousDecision } from "@/lib/truststack/orchestrator-loop";

export const runtime     = "nodejs";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExecutorContext(
  run:     DecisionRun,
  caseRef: string,
  userId:  string,
  dbCase?: { shopifyOrderId?: string | null; claimValueUsd?: number | null; email?: string | null },
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
    shopifyOrderId:     dbCase?.shopifyOrderId ?? undefined,
    claimValueUsd:      dbCase?.claimValueUsd ?? undefined,
    claimantEmail:      dbCase?.email ?? undefined,
  };
}

/**
 * Full analysis pipeline — runs in background after 202 is returned.
 * Uses runWithLoop for the iterative evidence-gathering logic.
 */
export async function runAnalysisBackground(
  caseId:       string,
  userId:       string,
  caseRef:      string,
  policyConfig: PolicyConfig,
): Promise<void> {
  try {
    // Re-load the case inside the background job (fresh snapshot)
    const dbCase = await db.case.findFirst({
      where:   { id: caseId, userId },
      include: { evidence: true },
    });
    if (!dbCase) return; // case deleted between accept and execution

    const claimCase = dbCaseToClaimCase(dbCase);

    // Determine iteration number from prior completed runs
    const priorRuns = await db.decisionRun.count({
      where: { caseId, completedAt: { not: null } },
    });
    const iterationNumber = priorRuns + 1;

    // Fetch previous run's decision for judge context (iteration 2+)
    let previousDecision: PreviousDecision | undefined;
    if (iterationNumber > 1) {
      const prev = await db.decisionRun.findFirst({
        where:   { caseId, completedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        select:  { outcome: true, explanation: true, iterationNumber: true },
      });
      if (prev?.outcome) {
        previousDecision = {
          outcome:     prev.outcome,
          explanation: prev.explanation ?? "",
          iteration:   prev.iterationNumber ?? iterationNumber - 1,
        };
      }
    }

    // Run the pipeline with loop policy
    const loopResult = await runWithLoop({
      claimCase,
      policyConfig,
      triggeredBy:     userId,
      iterationNumber,
      caseCreatedAt:   dbCase.createdAt,
      previousDecision,
    });

    const { run, shouldAwaitEvidence, forcedEscalation, timedOut } = loopResult;

    if (shouldAwaitEvidence) {
      // Persist run (status reflects "request_more_evidence" → AWAITING_EVIDENCE)
      await updateCaseWithRun(caseId, run, claimCase, userId);
      // Execute only the evidence-request action — don't trigger other side-effects
      const evidenceActions = run.actions.filter((a) => a.action === "request_more_evidence");
      await executeActions(caseId, evidenceActions, buildExecutorContext(run, caseRef, userId, dbCase));

      // Fire webhook with awaiting flag
      const response = buildClaimResponse(run, caseRef);
      await dispatchWebhook(caseId, "analysis.completed", {
        ...(response as unknown as Record<string, unknown>),
        awaiting_evidence: true,
        iteration_number:  iterationNumber,
      });
      return;
    }

    // Normal / escalated / timed-out completion
    await updateCaseWithRun(caseId, run, claimCase, userId);
    await executeActions(caseId, run.actions, buildExecutorContext(run, caseRef, userId, dbCase));

    const response = buildClaimResponse(run, caseRef);
    await dispatchWebhook(caseId, "analysis.completed", {
      ...(response as unknown as Record<string, unknown>),
      awaiting_evidence: false,
      iteration_number:  iterationNumber,
      forced_escalation: forcedEscalation,
      timed_out:         timedOut,
    });

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

  setImmediate(() => {
    void runAnalysisBackground(caseId, userId, dbCase.ref, policyConfig);
  });

  return NextResponse.json(
    { status: "processing", caseId, pollUrl: `/api/cases/${caseId}/status` },
    { status: 202 },
  );
});
