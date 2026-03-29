/**
 * POST /api/cases/:id/actions/:action
 *
 * Execute or record a bounded action against a case.
 * Actions available via this endpoint are human-initiated overrides —
 * system actions are handled automatically by the ActionAgent in the pipeline.
 *
 * Supported action values:
 *   approve              — human approves the claim
 *   reject               — human rejects the claim
 *   request_more_evidence — request additional documentation from claimant
 *   send_to_review       — escalate to a different review queue
 *   reopen               — reopen a resolved case
 *
 * Request body (JSON, optional):
 *   notes?  string   — reason for the action (stored in audit log)
 *
 * Response 200:
 *   { caseId, action, status, appliedAt, auditMessage }
 */

import { NextResponse }         from "next/server";
import { resolveUserId }        from "@/lib/apikey-auth";
import { db }                   from "@/lib/db";
import { saveActionExecutions } from "@/lib/truststack-repo";
import { ApiError, withErrorHandling } from "@/lib/api-validate";

export const runtime = "nodejs";

const ALLOWED_ACTIONS = new Set([
  "approve",
  "reject",
  "request_more_evidence",
  "send_to_review",
  "reopen",
]);

const ACTION_TO_STATUS: Record<string, string> = {
  approve:               "APPROVED",
  reject:                "REJECTED",
  request_more_evidence: "PENDING_REVIEW",
  send_to_review:        "PENDING_REVIEW",
  reopen:                "OPEN",
};

const ACTION_AUDIT_MESSAGES: Record<string, string> = {
  approve:               "Case approved by human reviewer.",
  reject:                "Case rejected by human reviewer.",
  request_more_evidence: "Additional evidence requested from claimant.",
  send_to_review:        "Case escalated to review queue by human agent.",
  reopen:                "Case reopened for re-evaluation.",
};

export const POST = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const { id: caseId, action } = await params;

  if (!ALLOWED_ACTIONS.has(action)) {
    throw new ApiError(
      400,
      `Unknown action "${action}". Allowed: ${[...ALLOWED_ACTIONS].join(", ")}.`,
    );
  }

  // Load + verify ownership
  const dbCase = await db.case.findFirst({
    where:  { id: caseId, userId },
    select: { id: true, status: true, ref: true },
  });
  if (!dbCase) throw new ApiError(404, "Case not found.");

  // Guard: can't reopen an open case; can't approve/reject a pending case that's already resolved
  if (action === "reopen" && dbCase.status === "OPEN") {
    throw new ApiError(409, "Case is already open.");
  }
  if (
    (action === "approve" || action === "reject") &&
    (dbCase.status === "APPROVED" || dbCase.status === "REJECTED")
  ) {
    throw new ApiError(409, `Case is already ${dbCase.status.toLowerCase()}.`);
  }

  const body     = await request.json().catch(() => ({})) as Record<string, unknown>;
  const notes    = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : undefined;
  const newStatus = ACTION_TO_STATUS[action];
  const appliedAt = new Date();

  // Update case status
  await db.case.update({
    where: { id: caseId },
    data: {
      status:     newStatus as any,
      updatedAt:  appliedAt,
      resolvedAt: action === "approve" || action === "reject" ? appliedAt : undefined,
    },
  });

  // Append event to audit log
  await db.caseEvent.create({
    data: {
      caseId,
      actor:   userId,
      type:    "override",
      payload: {
        action,
        previousStatus: dbCase.status,
        newStatus,
        notes: notes ?? null,
      },
    },
  });

  const auditMessage = notes
    ? `${ACTION_AUDIT_MESSAGES[action]} Note: ${notes}`
    : ACTION_AUDIT_MESSAGES[action];

  // Persist structured ActionExecution record (best-effort, no run id for overrides)
  saveActionExecutions(
    null,
    caseId,
    [{ id: caseId + ":" + action, caseId, action: action as any, status: "completed", auditMessage }],
    userId,
    /* isOverride */ true,
  ).catch(() => null);

  return NextResponse.json({
    caseId,
    ref:          dbCase.ref,
    action,
    newStatus,
    appliedAt,
    auditMessage,
  });
});
