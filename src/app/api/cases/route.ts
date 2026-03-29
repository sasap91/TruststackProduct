/**
 * POST /api/cases
 *
 * Create a new ClaimCase. Returns the case ID and ref immediately.
 * Evidence is added separately via POST /api/cases/:id/evidence.
 * Analysis is triggered via POST /api/cases/:id/analyze.
 *
 * Request body (JSON):
 *   description?    string
 *   claimType?      "damaged_item" | "not_received" | "wrong_item" | string
 *   deliveryStatus? "delivered_intact" | "not_delivered" | "unknown" | string
 *   claimAgeHours?  number
 *   highValue?      boolean
 *   refundRate?     number  (0–1)
 *   hasVideoProof?  boolean
 *   policyPackId?   "standard" | "strict" | "lenient"
 *
 * Response 201:
 *   { caseId, ref, status, createdAt }
 */

import { NextResponse }       from "next/server";
import { resolveUserId }      from "@/lib/apikey-auth";
import { checkRateLimit }     from "@/lib/ratelimit";
import { db }                 from "@/lib/db";
import { generateCaseRef }    from "@/lib/truststack/api";
import {
  ApiError,
  requireJsonBody,
  optionalField,
  withErrorHandling,
} from "@/lib/api-validate";

export const runtime = "nodejs";

export const POST = withErrorHandling(async (request) => {
  const userId = await resolveUserId(request);
  if (!userId) throw new ApiError(401, "Unauthorized.");

  const allowed = await checkRateLimit(userId, "/api/cases");
  if (!allowed) throw new ApiError(429, "Rate limit exceeded. Max 20 requests per minute.");

  const body = await requireJsonBody(request) as Record<string, unknown>;

  const ref = generateCaseRef();
  const now = new Date();

  const dbCase = await db.case.create({
    data: {
      ref,
      userId,
      status:         "OPEN",
      description:    optionalField<string>(body, "description")?.slice(0, 1000),
      claimType:      optionalField<string>(body, "claimType"),
      deliveryStatus: optionalField<string>(body, "deliveryStatus"),
      events: {
        create: [{
          actor:   userId,
          type:    "case_created",
          payload: {
            claimType:     optionalField(body, "claimType"),
            deliveryStatus: optionalField(body, "deliveryStatus"),
            policyPackId:  optionalField(body, "policyPackId"),
          },
        }],
      },
    },
    select: { id: true, ref: true, status: true, createdAt: true },
  });

  return NextResponse.json(
    {
      caseId:    dbCase.id,
      ref:       dbCase.ref,
      status:    dbCase.status,
      createdAt: dbCase.createdAt,
    },
    { status: 201 },
  );
});
