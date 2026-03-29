/**
 * POST /api/cases/:id/review
 *
 * Submit a human review decision on a case that is pending review.
 * Intended for use by fraud analysts and human reviewers in the review queue.
 *
 * Request body (JSON):
 *   decision   "approve" | "reject" | "request_more_evidence"  (required)
 *   notes?     string   — reviewer notes (stored in audit log, max 2000 chars)
 *   confidence? number  — reviewer confidence 0–1 (optional, for analytics)
 *
 * Response 200:
 *   { caseId, ref, decision, status, reviewedAt, reviewerId }
 */

import { NextResponse }         from "next/server";
import { resolveUserId }        from "@/lib/apikey-auth";
import { db }                   from "@/lib/db";
import { saveHumanReview }      from "@/lib/truststack-repo";
import { recordHumanOverride }  from "@/lib/truststack/eval/feedback";
import type { DecisionOutcome } from "@/lib/truststack";
import {
  ApiError,
  requireJsonBody,
  requireField,
  optionalField,
  withErrorHandling,
} from "@/lib/api-validate";

export const runtime = "nodejs";

const REVIEW_DECISIONS = new Set(["approve", "reject", "request_more_evidence"]);

const DECISION_TO_STATUS: Record<string, string> = {
  approve:               "APPROVED",
  reject:                "REJECTED",
  request_more_evidence: "PENDING_REVIEW",
};

export const POST = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const { id: caseId } = await params;

  const dbCase = await db.case.findFirst({
    where:  { id: caseId, userId },
    select: { id: true, status: true, ref: true, decision: true },
  });
  if (!dbCase) throw new ApiError(404, "Case not found.");

  // Only PENDING_REVIEW and FLAGGED cases can be reviewed
  if (dbCase.status !== "PENDING_REVIEW" && dbCase.status !== "FLAGGED") {
    throw new ApiError(
      409,
      `Case status is "${dbCase.status}" — only PENDING_REVIEW or FLAGGED cases can be reviewed.`,
    );
  }

  const body     = await requireJsonBody(request) as Record<string, unknown>;
  const decision = requireField<string>(body, "decision", "string");

  if (!REVIEW_DECISIONS.has(decision)) {
    throw new ApiError(
      400,
      `decision must be one of: ${[...REVIEW_DECISIONS].join(", ")}.`,
    );
  }

  const notes      = optionalField<string>(body, "notes")?.slice(0, 2000);
  const confidence = optionalField<number>(body, "confidence");
  const newStatus  = DECISION_TO_STATUS[decision];
  const reviewedAt = new Date();

  await db.case.update({
    where: { id: caseId },
    data: {
      status:     newStatus as any,
      updatedAt:  reviewedAt,
      resolvedAt: decision !== "request_more_evidence" ? reviewedAt : undefined,
    },
  });

  await db.caseEvent.create({
    data: {
      caseId,
      actor:   userId,
      type:    "review_submitted",
      payload: {
        decision,
        previousStatus: dbCase.status,
        newStatus,
        notes:      notes ?? null,
        confidence: confidence ?? null,
        reviewerId: userId,
      },
    },
  });

  // Persist structured HumanReview record (best-effort)
  saveHumanReview({
    caseId,
    reviewerId:     userId,
    decision,
    previousStatus: dbCase.status,
    newStatus,
    notes:      notes ?? undefined,
    confidence: confidence ?? undefined,
  }).catch(() => null);

  const latestRun = await db.decisionRun.findFirst({
    where: { caseId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  recordHumanOverride({
    caseId,
    decisionRunId:   latestRun?.id,
    pipelineOutcome: (dbCase.decision as DecisionOutcome | null) ?? "review",
    reviewerDecision: decision,
    reviewerId:      userId,
    notes:           notes ?? undefined,
  }).catch(() => null);

  return NextResponse.json({
    caseId,
    ref:        dbCase.ref,
    decision,
    status:     newStatus,
    reviewedAt,
    reviewerId: userId,
    ...(notes ? { notes } : {}),
  });
});
