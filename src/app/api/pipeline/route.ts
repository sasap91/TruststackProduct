/**
 * POST /api/pipeline
 *
 * Run the TrustStack deterministic pipeline against a single claim.
 * Returns a PipelineDecision — no human gate.
 *
 * Request body (JSON):
 *   claimId            string   required
 *   retailerId         string   required
 *   customerId         string   required
 *   orderDate          string   required  ISO 8601 date
 *   claimDate          string   required  ISO 8601 date
 *   orderValue         number   required  minor currency units (e.g. cents)
 *   currency           string   required  ISO 4217
 *   productTitle       string   required
 *   productSku         string   required
 *   claimDescription   string   required
 *   evidenceUrls       string[] optional  default []
 *   photoUrls          string[] optional  default []
 *   declaredClaimType  string   optional  one of the 8 PipelineClaimType values
 *   metadata           object   optional  Record<string, string>
 *
 * Response 200:
 *   { outcome, fraudScore, triggeredRules, requiredActions, timestamp, claimId }
 *
 * Response 400: validation error
 * Response 401: unauthorized
 * Response 500: pipeline error
 */

import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/apikey-auth";
import { runPipeline, PipelineClaimType } from "@/lib/truststack/pipeline/index";
import type { PipelineClaimInput } from "@/lib/truststack/pipeline/index";

export const runtime    = "nodejs";
export const maxDuration = 60; // LLM steps can take up to 60 s total

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_CLAIM_TYPES = new Set<string>(Object.values(PipelineClaimType));
const ISO_DATE_RE       = /^\d{4}-\d{2}-\d{2}/;

function err(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function parseBody(body: Record<string, unknown>): PipelineClaimInput | Response {
  const str = (key: string, required = true): string | Response => {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (required) return err(`${key} is required and must be a non-empty string`);
    return "";
  };

  const claimId = str("claimId");
  if (claimId instanceof Response) return claimId;

  const retailerId = str("retailerId");
  if (retailerId instanceof Response) return retailerId;

  const customerId = str("customerId");
  if (customerId instanceof Response) return customerId;

  const orderDate = str("orderDate");
  if (orderDate instanceof Response) return orderDate;
  if (!ISO_DATE_RE.test(orderDate)) return err("orderDate must be an ISO 8601 date string (YYYY-MM-DD)");

  const claimDate = str("claimDate");
  if (claimDate instanceof Response) return claimDate;
  if (!ISO_DATE_RE.test(claimDate)) return err("claimDate must be an ISO 8601 date string (YYYY-MM-DD)");

  const orderValue = body["orderValue"];
  if (typeof orderValue !== "number" || !Number.isFinite(orderValue) || orderValue < 0) {
    return err("orderValue is required and must be a non-negative number (minor currency units)");
  }

  const currency = str("currency");
  if (currency instanceof Response) return currency;

  const productTitle = str("productTitle");
  if (productTitle instanceof Response) return productTitle;

  const productSku = str("productSku");
  if (productSku instanceof Response) return productSku;

  const claimDescription = str("claimDescription");
  if (claimDescription instanceof Response) return claimDescription;

  // Optional arrays
  const evidenceUrls = Array.isArray(body["evidenceUrls"])
    ? (body["evidenceUrls"] as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  const photoUrls = Array.isArray(body["photoUrls"])
    ? (body["photoUrls"] as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  // Optional declaredClaimType
  const rawDeclared = body["declaredClaimType"];
  let declaredClaimType: PipelineClaimType | undefined;
  if (typeof rawDeclared === "string") {
    if (!VALID_CLAIM_TYPES.has(rawDeclared)) {
      return err(
        `declaredClaimType "${rawDeclared}" is not a valid claim type. ` +
        `Valid values: ${[...VALID_CLAIM_TYPES].join(", ")}`,
      );
    }
    declaredClaimType = rawDeclared as PipelineClaimType;
  }

  // Optional metadata
  const rawMeta = body["metadata"];
  const metadata: Record<string, string> =
    typeof rawMeta === "object" && rawMeta !== null && !Array.isArray(rawMeta)
      ? Object.fromEntries(
          Object.entries(rawMeta as Record<string, unknown>).flatMap(([k, v]) =>
            typeof v === "string" ? [[k, v]] : [],
          ),
        )
      : {};

  return {
    claimId,
    retailerId,
    customerId,
    orderDate,
    claimDate,
    orderValue,
    currency,
    productTitle,
    productSku,
    claimDescription,
    evidenceUrls,
    photoUrls,
    declaredClaimType,
    metadata,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // Auth
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = parseBody(body);
  if (input instanceof Response) return input;

  // Run pipeline
  try {
    const decision = await runPipeline(input, {
      // Silence audit logs in the API context (handled externally)
      auditWriter: async () => { /* no-op — callers handle persistence */ },
    });

    return NextResponse.json(decision, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown pipeline error";
    console.error("[pipeline] Error:", msg, err);
    return NextResponse.json({ error: `Pipeline failed: ${msg}` }, { status: 500 });
  }
}
