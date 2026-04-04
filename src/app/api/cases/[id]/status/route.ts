/**
 * GET /api/cases/:id/status
 *
 * Lightweight poll endpoint for async analysis. Returns:
 *
 *   { status: "processing" }                          — case is still ANALYZING
 *   { status: "completed", decisionRunId: string }    — analysis finished
 *   { status: "failed",    error?: string }           — analysis threw before persisting
 *
 * Status derivation:
 *   - Case.status === "ANALYZING"                              → processing
 *   - Latest DecisionRun has completedAt                      → completed
 *   - Most recent CaseEvent type === "analysis_failed"        → failed
 *   - Anything else (OPEN with no run yet)                    → processing
 */

import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/apikey-auth";
import { db } from "@/lib/db";
import { ApiError, withErrorHandling } from "@/lib/api-validate";

export const runtime = "nodejs";

export const GET = withErrorHandling(async (request, { params }) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const { id: caseId } = await params;

  const dbCase = await db.case.findFirst({
    where:   { id: caseId, userId },
    select: {
      status: true,
      runs: {
        orderBy: { startedAt: "desc" },
        take:    1,
        select:  { id: true, completedAt: true },
      },
      events: {
        where:   { type: "analysis_failed" },
        orderBy: { createdAt: "desc" },
        take:    1,
        select:  { payload: true },
      },
    },
  });

  if (!dbCase) throw new ApiError(404, "Case not found.");

  // Still running
  if (dbCase.status === "ANALYZING") {
    return NextResponse.json({ status: "processing" });
  }

  // Completed — latest run has a completedAt timestamp
  const latestRun = dbCase.runs[0];
  if (latestRun?.completedAt) {
    return NextResponse.json({ status: "completed", decisionRunId: latestRun.id });
  }

  // Failed — analysis_failed event was written by the background job
  const failedEvent = dbCase.events[0];
  if (failedEvent) {
    const payload = failedEvent.payload as Record<string, unknown> | null;
    return NextResponse.json({
      status: "failed",
      error:  typeof payload?.error === "string" ? payload.error : "Analysis failed.",
    });
  }

  // Default: case exists but has never been analyzed yet
  return NextResponse.json({ status: "processing" });
});
