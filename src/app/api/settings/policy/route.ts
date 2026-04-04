import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensurePolicyVersion, getMerchantPolicy } from "@/lib/truststack-repo";

export const runtime = "nodejs";

const DEFAULT_POLICY = {
  riskWeights: { fraud: 0.35, claimIntegrity: 0.30, account: 0.20, procedural: 0.15 },
  autoApproveBelow:    0.10,
  autoRejectAbove:     0.88,
  reviewBand:          { low: 0.10, high: 0.88 },
  claimValueThreshold: null,
  maxRefundsPerMonth:  null,
  customRules:         [] as unknown[],
};

// GET — return saved policy, or default shape if none saved yet
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const policy = await getMerchantPolicy(userId);
  return NextResponse.json(policy ?? DEFAULT_POLICY);
}

// PUT — upsert MerchantPolicy + snapshot as PolicyVersion
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });

  // Validate risk weights sum to 1 (within float tolerance)
  const w = body.riskWeights as { fraud?: number; claimIntegrity?: number; account?: number; procedural?: number } | undefined;
  if (w) {
    const sum = (w.fraud ?? 0) + (w.claimIntegrity ?? 0) + (w.account ?? 0) + (w.procedural ?? 0);
    if (Math.abs(sum - 1) > 0.01) {
      return NextResponse.json({ error: "Risk weights must sum to 1.0." }, { status: 422 });
    }
  }

  const autoApproveBelow = typeof body.autoApproveBelow === "number" ? body.autoApproveBelow : DEFAULT_POLICY.autoApproveBelow;
  const autoRejectAbove  = typeof body.autoRejectAbove  === "number" ? body.autoRejectAbove  : DEFAULT_POLICY.autoRejectAbove;

  if (autoApproveBelow >= autoRejectAbove) {
    return NextResponse.json({ error: "autoApproveBelow must be less than autoRejectAbove." }, { status: 422 });
  }

  const reviewBand = (body.reviewBand as { low?: number; high?: number } | undefined) ?? DEFAULT_POLICY.reviewBand;
  const claimValueThreshold = typeof body.claimValueThreshold === "number" ? body.claimValueThreshold : null;
  const maxRefundsPerMonth  = typeof body.maxRefundsPerMonth  === "number" ? Math.round(body.maxRefundsPerMonth) : null;
  const customRules = Array.isArray(body.customRules) ? body.customRules : [];

  const sanitized = {
    riskWeights:         w ?? DEFAULT_POLICY.riskWeights,
    autoApproveBelow,
    autoRejectAbove,
    reviewBand,
    claimValueThreshold,
    maxRefundsPerMonth,
    customRules,
  };

  await db.merchantPolicy.upsert({
    where:  { userId },
    create: { userId, ...sanitized },
    update: sanitized,
  });

  // Snapshot the policy config for audit/replay
  await ensurePolicyVersion(
    {
      autoApproveBelow,
      autoRejectAbove,
    },
    "custom",
  ).catch(() => null);

  return NextResponse.json({ ok: true });
}
