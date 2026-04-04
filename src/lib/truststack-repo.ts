/**
 * truststack-repo.ts
 *
 * Focused repository functions for persisting TrustStack domain objects to
 * the normalized Prisma schema. Each function owns one entity type.
 *
 * Design rules:
 *   - One function per model: no cross-model concerns
 *   - All functions are idempotent where possible (upsert / findOrCreate)
 *   - No domain logic — that lives in src/lib/truststack/*
 *   - Callers can .catch(() => null) — nothing here is load-bearing for HTTP responses
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import type {
  DecisionRun    as DomainDecisionRun,
  NormalizedSignal,
  ActionExecution as DomainActionExecution,
} from "@/lib/truststack";
import type { FusedSignal } from "@/lib/truststack/types/fusion";
import type { PolicyConfig } from "@/lib/truststack";

// ── Policy version ────────────────────────────────────────────────────────────

/**
 * Find or create a PolicyVersion row for the given config.
 * Uses a SHA-256 prefix of the serialized config as the stable version key,
 * so the same config always maps to the same row.
 *
 * Returns the DB id.
 */
export async function ensurePolicyVersion(
  config:          PolicyConfig,
  packId:          string = "standard",
): Promise<string> {
  // Stable key: sort the config keys so insertion order doesn't matter
  const sorted  = Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b)));
  const digest  = createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 12);
  const version = `${packId}-${digest}`;

  const existing = await db.policyVersion.findUnique({ where: { version_packId: { version, packId } } });
  if (existing) return existing.id;

  const created = await db.policyVersion.create({
    data: { version, packId, configSnapshot: config as any, isActive: true },
    select: { id: true },
  });
  return created.id;
}

// ── Decision run ──────────────────────────────────────────────────────────────

/**
 * Persist a completed DomainDecisionRun as a DecisionRun row.
 * Does NOT create signals or actions — call the dedicated functions for those.
 *
 * Returns the DB DecisionRun id.
 */
export async function saveDecisionRun(
  caseId:          string,
  run:             DomainDecisionRun,
  policyVersionId: string | null,
): Promise<string> {
  const fusion   = run.fusionResult;
  const risk     = run.riskAssessment;
  const decision = run.policyDecision;

  const row = await db.decisionRun.create({
    data: {
      id:              run.id,
      caseId,
      policyVersionId: policyVersionId ?? undefined,
      triggeredBy:     run.triggeredBy,
      pipelineVersion: run.pipelineVersion,

      // Risk
      riskScore:        risk?.consistencyScore,
      riskLevel:        risk?.riskLevel,
      evidenceStrength: fusion?.evidenceStrength,
      consistencyScore: risk?.consistencyScore,
      modalitiesCovered: fusion?.modalitiesCovered ?? [],

      // Decision
      outcome:     decision?.outcome,
      confidence:  decision?.confidence,
      explanation: run.justification,
      judgeSource: run.judgeSource,

      // Timing
      startedAt:   run.startedAt,
      completedAt: run.completedAt,
      durationMs:  run.durationMs,
    },
    select: { id: true },
  });

  return row.id;
}

// ── Extracted signals ─────────────────────────────────────────────────────────

/**
 * Bulk-persist NormalizedSignals (or FusedSignals) for a DecisionRun.
 *
 * artifactIdMap: domain artifactId → DB EvidenceArtifact.id
 * If a signal's first sourceArtifactId is in the map, the DB FK is set.
 */
export async function saveExtractedSignals(
  decisionRunId: string,
  caseId:        string,
  signals:       NormalizedSignal[],
  artifactIdMap: Map<string, string> = new Map(),
): Promise<void> {
  if (signals.length === 0) return;

  await db.extractedSignal.createMany({
    data: signals.map((s) => {
      const fused = s as Partial<FusedSignal>;
      const domainArtifactId = s.sourceArtifactIds?.[0];
      const dbArtifactId     = domainArtifactId ? artifactIdMap.get(domainArtifactId) : undefined;

      return {
        caseId,
        decisionRunId,
        sourceArtifactId: dbArtifactId ?? null,
        key:            s.key,
        value:          s.value,
        flag:           s.flag,
        weight:         s.weight,
        confidence:     s.confidence,
        rawScore:       s.rawScore ?? null,
        sourceModality: s.sourceModality,
        extractor:      s.extractor,
        rationale:      s.rationale ?? null,
        reinforced:     fused.reinforced  ?? false,
        fusedFromCount: fused.fusedFromCount ?? 1,
        corroboratedBy: fused.corroboratedBy ?? [],
        contradictedBy: fused.contradictedBy ?? [],
      };
    }),
    skipDuplicates: true,
  });
}

// ── Action executions ─────────────────────────────────────────────────────────

/**
 * Bulk-persist ActionExecutions for a DecisionRun.
 * isOverride = false for system-generated actions.
 */
export async function saveActionExecutions(
  decisionRunId: string | null,
  caseId:        string,
  actions:       DomainActionExecution[],
  triggeredBy:   string,
  isOverride:    boolean = false,
): Promise<void> {
  if (actions.length === 0) return;

  await db.actionExecution.createMany({
    data: actions.map((a) => ({
      caseId,
      decisionRunId: decisionRunId ?? null,
      action:       a.action,
      status:       "pending", // executor transitions: pending → executing → completed | failed
      targetSystem: a.targetSystem ?? null,
      auditMessage: a.auditMessage,
      triggeredBy,
      isOverride,
    })),
    skipDuplicates: true,
  });
}

// ── Velocity data ─────────────────────────────────────────────────────────────

export type VelocityData = {
  /** Cases filed by the same userId in the last 30 days (excluding caseId) */
  claimsLast30DaysByUser:    number;
  /** Cases with the same normalized shippingAddress in the last 30 days, or null if not provided */
  claimsLast30DaysByAddress: number | null;
  /** Cases with the same email in the last 30 days, or null if not provided */
  claimsLast30DaysByEmail:   number | null;
};

/**
 * Query historical claim counts for velocity signal computation.
 * Excludes the current case (caseId) from all counts.
 * Runs three COUNT queries in parallel — each indexed by the relevant field.
 */
export async function getVelocitySignals(
  caseId: string,
  userId: string,
  opts?: {
    shippingAddress?: string;
    email?: string;
  },
): Promise<VelocityData> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [byUser, byAddress, byEmail] = await Promise.all([
    db.case.count({
      where: { userId, createdAt: { gte: since }, id: { not: caseId } },
    }),
    opts?.shippingAddress
      ? db.case.count({
          where: {
            shippingAddress: opts.shippingAddress,
            createdAt: { gte: since },
            id: { not: caseId },
          },
        })
      : Promise.resolve(null),
    opts?.email
      ? db.case.count({
          where: {
            email: opts.email,
            createdAt: { gte: since },
            id: { not: caseId },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    claimsLast30DaysByUser:    byUser,
    claimsLast30DaysByAddress: byAddress,
    claimsLast30DaysByEmail:   byEmail,
  };
}

// ── Merchant policy ───────────────────────────────────────────────────────────

export type StoredRiskWeights = {
  fraud:          number;
  claimIntegrity: number;
  account:        number;
  procedural:     number;
};

export type StoredCustomRule = {
  id:         string;
  name:       string;
  signal_key: string;
  outcome:    string;
  priority:   number;
  override:   boolean;
};

export type MerchantPolicyData = {
  riskWeights:         StoredRiskWeights;
  autoApproveBelow:    number;
  autoRejectAbove:     number;
  reviewBand:          { low: number; high: number };
  claimValueThreshold: number | null;
  maxRefundsPerMonth:  number | null;
  customRules:         StoredCustomRule[];
};

/**
 * Load the merchant's saved policy configuration.
 * Returns null if no policy has been saved yet (caller uses hardcoded defaults).
 */
export async function getMerchantPolicy(userId: string): Promise<MerchantPolicyData | null> {
  const row = await db.merchantPolicy.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    riskWeights:         row.riskWeights         as StoredRiskWeights,
    autoApproveBelow:    row.autoApproveBelow,
    autoRejectAbove:     row.autoRejectAbove,
    reviewBand:          row.reviewBand           as { low: number; high: number },
    claimValueThreshold: row.claimValueThreshold,
    maxRefundsPerMonth:  row.maxRefundsPerMonth,
    customRules:         (row.customRules         as StoredCustomRule[]) ?? [],
  };
}

// ── Human review ──────────────────────────────────────────────────────────────

/**
 * Persist a human reviewer's decision.
 * Returns the HumanReview DB id.
 */
export async function saveHumanReview(input: {
  caseId:         string;
  decisionRunId?: string;
  reviewerId:     string;
  decision:       string;
  previousStatus: string;
  newStatus:      string;
  notes?:         string;
  confidence?:    number;
}): Promise<string> {
  const row = await db.humanReview.create({
    data: {
      caseId:         input.caseId,
      decisionRunId:  input.decisionRunId ?? null,
      reviewerId:     input.reviewerId,
      decision:       input.decision,
      previousStatus: input.previousStatus,
      newStatus:      input.newStatus,
      notes:          input.notes ?? null,
      confidence:     input.confidence ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

// ── Convenience: save everything from a completed run ─────────────────────────

/**
 * Persist all structured outputs of a completed DomainDecisionRun:
 *   1. Ensure a PolicyVersion row exists
 *   2. Create a DecisionRun row
 *   3. Bulk-insert ExtractedSignals
 *   4. Bulk-insert ActionExecutions
 *
 * artifactIdMap: domain EvidenceArtifact.id → DB EvidenceArtifact.id
 * policyConfig + packId are used to find/create the PolicyVersion.
 *
 * Returns the DB DecisionRun id.
 * Safe to fire-and-forget (.catch(() => null)).
 */
export async function persistRunOutputs(
  caseId:        string,
  run:           DomainDecisionRun,
  policyConfig:  PolicyConfig,
  packId:        string = "standard",
  artifactIdMap: Map<string, string> = new Map(),
): Promise<string> {
  const policyVersionId = await ensurePolicyVersion(policyConfig, packId);
  const runId           = await saveDecisionRun(caseId, run, policyVersionId);

  const signals = run.fusionResult?.fusedSignals ?? run.riskAssessment?.signals ?? [];
  await saveExtractedSignals(runId, caseId, signals, artifactIdMap);
  await saveActionExecutions(runId, caseId, run.actions, run.triggeredBy);

  return runId;
}
