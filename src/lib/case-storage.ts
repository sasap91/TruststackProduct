/**
 * case-storage.ts
 *
 * High-level persistence helpers that bridge the TrustStack domain model and
 * the Prisma schema. Orchestrates writes across Case, EvidenceArtifact,
 * CaseEvent, and the normalized run tables (via truststack-repo.ts).
 *
 * All functions are fire-and-forget safe — callers can .catch(() => null).
 */

import { db } from "@/lib/db";
import { outcomeToDbStatus } from "@/lib/truststack/api";
import { persistRunOutputs } from "@/lib/truststack-repo";
import type { DecisionRun, PolicyConfig } from "@/lib/truststack";
import type { ClaimCase, EvidenceArtifact } from "@/lib/truststack";

// ── EvidenceType mapping ──────────────────────────────────────────────────────

const MODALITY_TO_DB_TYPE: Record<string, string> = {
  image:    "IMAGE",
  text:     "TEXT",
  document: "DOCUMENT",
  metadata: "METADATA",
  video:    "DOCUMENT",
};

const DB_TYPE_TO_MODALITY: Record<string, string> = {
  IMAGE:      "image",
  TEXT:       "text",
  DOCUMENT:   "document",
  ORDER_DATA: "metadata",
  METADATA:   "metadata",
};

// ── Full persist: create Case + run outputs ───────────────────────────────────

/**
 * Create a new Case row with nested evidence and events, then persist the
 * normalized run outputs (DecisionRun, ExtractedSignals, ActionExecutions)
 * in the dedicated tables.
 *
 * Used by POST /api/analyze/claim — the legacy single-shot endpoint.
 */
export async function persistRunToDb(
  run:          DecisionRun,
  claimCase:    ClaimCase,
  userId:       string,
  opts?:        { imageMime?: string; imageSizeBytes?: number },
  policyConfig: PolicyConfig = {},
): Promise<string> {
  const decision   = run.policyDecision;
  const risk       = run.riskAssessment;
  const caseStatus = decision ? outcomeToDbStatus(decision.outcome) : "FLAGGED";
  const signals    = run.fusionResult?.fusedSignals ?? risk?.signals ?? [];

  // domain artifactId → DB EvidenceArtifact id (populated via select)
  const artifactIdMap = new Map<string, string>();

  // Build the evidence create payloads, collecting a domainId for each
  type EvidenceInput = {
    _domainId: string;
    type:      string;
    rawText?:  string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    agentName?: string | null;
    agentModel?: string | null;
    agentSource?: string | null;
    rawScore?: number | null;
    agentNotes?: any;
    signals?: any;
  };

  const evidenceInputs: EvidenceInput[] = run.artifactAnalyses.map((analysis) => {
    const artifact = claimCase.evidence.find((a) => a.id === analysis.artifactId);
    const modality = artifact?.modality ?? "text";
    const dbType   = MODALITY_TO_DB_TYPE[modality] ?? "TEXT";

    return {
      _domainId:  artifact?.id ?? analysis.artifactId,
      type:       dbType,
      rawText:    artifact?.content?.slice(0, 2000) ?? null,
      mimeType:   artifact?.mimeType ?? (modality === "image" ? opts?.imageMime : null) ?? null,
      sizeBytes:  artifact?.sizeBytes ?? (modality === "image" ? opts?.imageSizeBytes : null) ?? null,
      agentName:  analysis.agentId,
      agentModel: analysis.modelId ?? null,
      agentSource: analysis.provider ?? null,
      rawScore:   analysis.rawScore ?? null,
      agentNotes: (analysis.notes ?? []) as any,
      signals:    signals.filter((s) => s.sourceArtifactIds.includes(artifact?.id ?? "")) as any,
    };
  });

  // Strip the _domainId sentinel before writing to Prisma
  const dbCase = await db.case.create({
    data: {
      ref:           claimCase.ref,
      userId,
      status:        caseStatus as any,
      claimType:     claimCase.claimType,
      description:   claimCase.description?.slice(0, 1000),
      deliveryStatus: claimCase.deliveryStatus,
      signals:        signals as any,
      consistencyScore: risk?.consistencyScore,
      riskScore:       risk?.consistencyScore,
      riskLevel:       risk?.riskLevel,
      decision:        decision?.outcome,
      auditTrail:      decision?.matchedRules.filter((r) => r.triggered).map((r) => r.detail) ?? [],
      justification:   run.justification,
      judgeSource:     run.judgeSource,
      resolvedAt:      new Date(),

      evidence: {
        create: evidenceInputs.map(({ _domainId: _unused, ...rest }) => rest as any),
      },
      events: {
        create: buildCaseEvents(run, userId, caseStatus),
      },
    },
    select: {
      id: true,
      evidence: { select: { id: true } },
    },
  });

  // Build domainId → dbId map (positional: evidence created in same order)
  evidenceInputs.forEach((input, i) => {
    const dbArtifact = dbCase.evidence[i];
    if (dbArtifact) artifactIdMap.set(input._domainId, dbArtifact.id);
  });

  // Persist normalized run tables (background — already in a bg context)
  await persistRunOutputs(dbCase.id, run, policyConfig, "standard", artifactIdMap);

  return dbCase.id;
}

// ── Update existing case with run outputs ─────────────────────────────────────

/**
 * Update an existing Case row with the latest run results, then persist
 * the normalized run outputs in the dedicated tables.
 *
 * Used by POST /api/cases/:id/analyze — the case-based API flow.
 */
export async function updateCaseWithRun(
  dbCaseId:     string,
  run:          DecisionRun,
  claimCase:    ClaimCase,
  userId:       string,
  policyConfig: PolicyConfig = {},
): Promise<void> {
  const decision   = run.policyDecision;
  const risk       = run.riskAssessment;
  const caseStatus = decision ? outcomeToDbStatus(decision.outcome) : "FLAGGED";
  const signals    = run.fusionResult?.fusedSignals ?? risk?.signals ?? [];

  // Update the Case denormalized fields
  await db.case.update({
    where: { id: dbCaseId },
    data: {
      status:          caseStatus as any,
      signals:         signals as any,
      consistencyScore: risk?.consistencyScore,
      riskScore:        risk?.consistencyScore,
      riskLevel:        risk?.riskLevel,
      decision:         decision?.outcome,
      auditTrail:       decision?.matchedRules.filter((r) => r.triggered).map((r) => r.detail) ?? [],
      justification:    run.justification,
      judgeSource:      run.judgeSource,
      updatedAt:        new Date(),
      resolvedAt:       new Date(),
      events: {
        create: buildCaseEvents(run, userId, caseStatus),
      },
    },
  });

  // Build artifactIdMap from the existing DB evidence rows
  const dbEvidence = await db.evidenceArtifact.findMany({
    where:  { caseId: dbCaseId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const artifactIdMap = new Map<string, string>();
  claimCase.evidence.forEach((artifact, i) => {
    const dbRow = dbEvidence[i];
    if (dbRow) artifactIdMap.set(artifact.id, dbRow.id);
  });

  await persistRunOutputs(dbCaseId, run, policyConfig, "standard", artifactIdMap);
}

// ── DB → Domain mapper ────────────────────────────────────────────────────────

/** Map a Prisma Case + its evidence records into a TrustStack ClaimCase. */
export function dbCaseToClaimCase(dbCase: any): ClaimCase {
  const evidence: EvidenceArtifact[] = (dbCase.evidence ?? []).map((e: any) => ({
    id:         e.id,
    caseId:     e.caseId,
    modality:   DB_TYPE_TO_MODALITY[e.type] ?? "text",
    status:     "complete" as const,
    content:    e.rawText ?? undefined,
    storageRef: e.storageRef ?? undefined,
    mimeType:   e.mimeType ?? undefined,
    sizeBytes:  e.sizeBytes ?? undefined,
    createdAt:  e.createdAt,
  }));

  return {
    id:             dbCase.id,
    ref:            dbCase.ref,
    userId:         dbCase.userId,
    status:         dbCase.status,
    claimType:      dbCase.claimType ?? undefined,
    deliveryStatus: dbCase.deliveryStatus ?? undefined,
    description:    dbCase.description ?? undefined,
    evidence,
    createdAt:      dbCase.createdAt,
    updatedAt:      dbCase.updatedAt,
  };
}

// ── Shared event builders ─────────────────────────────────────────────────────

function buildCaseEvents(run: DecisionRun, userId: string, caseStatus: string) {
  const events: Array<{ actor: string; type: string; payload: any }> = [
    {
      actor:   "system",
      type:    "agents_completed",
      payload: {
        runId:             run.id,
        artifactCount:     run.artifactAnalyses.length,
        modalitiesCovered: run.fusionResult?.modalitiesCovered ?? [],
      },
    },
  ];

  if (run.fusionResult) {
    events.push({
      actor:   "system",
      type:    "signals_fused",
      payload: {
        runId:             run.id,
        signalCount:       run.fusionResult.fusedSignals.length,
        contradictionCount: run.fusionResult.contradictions.length,
        evidenceStrength:  run.fusionResult.evidenceStrength,
      },
    });
  }

  if (run.riskAssessment) {
    events.push({
      actor:   "system",
      type:    "risk_assessed",
      payload: {
        runId:            run.id,
        riskLevel:        run.riskAssessment.riskLevel,
        consistencyScore: run.riskAssessment.consistencyScore,
      },
    });
  }

  if (run.policyDecision) {
    events.push({
      actor:   "system",
      type:    "policy_applied",
      payload: {
        runId:          run.id,
        outcome:        run.policyDecision.outcome,
        triggeredRules: run.policyDecision.matchedRules.filter((r) => r.triggered).length,
        confidence:     run.policyDecision.confidence,
      },
    });
  }

  if (run.judgeSource) {
    events.push({
      actor:   "system",
      type:    "judge_completed",
      payload: { runId: run.id, judgeSource: run.judgeSource },
    });
  }

  events.push({
    actor:   userId,
    type:    "status_changed",
    payload: { runId: run.id, from: "ANALYZING", to: caseStatus },
  });

  return events;
}
