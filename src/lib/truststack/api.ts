/**
 * TrustStack HTTP API bridge
 *
 * Pure domain functions for translating between HTTP request data and the
 * truststack domain model. No DB calls, no framework imports.
 *
 * Exports:
 *   generateCaseRef()       — stable TS-YYYY-XXXX reference
 *   buildClaimCase()        — constructs ClaimCase + mediaBuffers from parsed fields
 *   buildClaimResponse()    — shapes DecisionRun into the API response contract
 *   outcomeToDbStatus()     — maps DecisionOutcome → CaseStatus string
 *   ClaimAnalysisResponse   — canonical response type (UI + new API)
 */

import { randomUUID } from "crypto";
import type {
  ClaimCase,
  EvidenceArtifact,
  NormalizedSignal,
  DecisionRun,
  DecisionOutcome,
  CaseStatus,
  ContradictionReport,
  SignalFusionResult,
} from "./index";
import type { OrchestrationStep } from "./types/orchestration";
import type { ArtifactModality } from "./types/artifact";
import type { ActionType, ActionStatus } from "./types/action";

// ── Case reference ────────────────────────────────────────────────────────────

export function generateCaseRef(): string {
  const year = new Date().getFullYear();
  const hex  = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `TS-${year}-${hex}`;
}

// ── Outcome → DB status mapping ───────────────────────────────────────────────

const OUTCOME_TO_STATUS: Record<string, CaseStatus> = {
  approve:               "APPROVED",
  flag:                  "FLAGGED",
  review:                "FLAGGED",
  request_more_evidence: "PENDING_REVIEW",
  reject:                "REJECTED",
};

export function outcomeToDbStatus(outcome: DecisionOutcome): CaseStatus {
  return OUTCOME_TO_STATUS[outcome] ?? "FLAGGED";
}

// ── Request field types ───────────────────────────────────────────────────────

/** Parsed fields from the multipart claim form */
export type ClaimRequestFields = {
  claimText:          string;
  imageBuffer?:       ArrayBuffer;
  imageMime?:         string;
  imageSizeBytes?:    number;
  documentContent?:   string;
  documentFilename?:  string;
  documentMime?:      string;
  claimType?:         string;
  deliveryStatus?:    string;
  claimAgeHours?:     number;
  highValue?:         boolean;
  refundRate?:        number;
  hasVideoProof?:     boolean;
};

// ── ClaimCase builder ─────────────────────────────────────────────────────────

/** Build a ClaimCase and mediaBuffers map from parsed request fields. */
export function buildClaimCase(
  fields: ClaimRequestFields,
  userId:   string,
  caseRef?: string,
): { claimCase: ClaimCase; mediaBuffers: Map<string, ArrayBuffer> } {
  const caseId    = randomUUID();
  const ref       = caseRef ?? generateCaseRef();
  const now       = new Date();
  const artifacts: EvidenceArtifact[] = [];
  const mediaBuffers = new Map<string, ArrayBuffer>();

  // Text artifact (always present when claimText provided)
  const textArtifactId = randomUUID();
  artifacts.push({
    id:       textArtifactId,
    caseId,
    modality: "text",
    status:   "pending",
    content:  fields.claimText,
    createdAt: now,
  });

  // Image artifact
  if (fields.imageBuffer && fields.imageMime) {
    const imageArtifactId = randomUUID();
    artifacts.push({
      id:        imageArtifactId,
      caseId,
      modality:  "image",
      status:    "pending",
      mimeType:  fields.imageMime,
      sizeBytes: fields.imageSizeBytes,
      createdAt: now,
    });
    mediaBuffers.set(imageArtifactId, fields.imageBuffer);
  }

  // Document artifact
  if (fields.documentContent) {
    artifacts.push({
      id:        randomUUID(),
      caseId,
      modality:  "document",
      status:    "pending",
      content:   fields.documentContent,
      filename:  fields.documentFilename,
      mimeType:  fields.documentMime,
      createdAt: now,
    });
  }

  const claimCase: ClaimCase = {
    id:             caseId,
    ref,
    userId,
    status:         "ANALYZING",
    claimType:      fields.claimType,
    deliveryStatus: fields.deliveryStatus,
    description:    fields.claimText,
    highValue:      fields.highValue,
    hasVideoProof:  fields.hasVideoProof,
    refundRate:     fields.refundRate,
    claimAgeHours:  fields.claimAgeHours,
    evidence:       artifacts,
    createdAt:      now,
    updatedAt:      now,
  };

  return { claimCase, mediaBuffers };
}

// ── API response types ────────────────────────────────────────────────────────

export type ApiAction = {
  action:        ActionType;
  status:        ActionStatus;
  targetSystem?: string;
  auditMessage:  string;
};

export type ApiEvidenceSummaryEntry = {
  artifactId:     string;
  modality:       ArtifactModality;
  signalCount:    number;
  stepStatus:     OrchestrationStep["status"];
  skippedReason?: string;
};

export type ApiAuditStep = {
  stepId:     string;
  label:      string;
  status:     OrchestrationStep["status"];
  durationMs?: number;
  metadata?:  Record<string, unknown>;
};

/**
 * Canonical API response shape — returned by /api/analyze/claim and
 * /api/cases/:id/analyze. Keeps all legacy fields so existing UI keeps
 * working while adding the new structured fields.
 */
export type ClaimAnalysisResponse = {
  // ── Identity ────────────────────────────────────────────────────────────────
  caseId:        string;
  caseRef:       string;
  decisionRunId: string;

  // ── Decision ────────────────────────────────────────────────────────────────
  decision:    DecisionOutcome;
  explanation: string;
  judgeSource: "claude" | "demo";

  // ── Risk ────────────────────────────────────────────────────────────────────
  risk_score:  number;
  riskLevel:   string | undefined;

  // ── Actions ──────────────────────────────────────────────────────────────────
  actions: ApiAction[];

  // ── Evidence ─────────────────────────────────────────────────────────────────
  signals:          NormalizedSignal[];
  contradictions:   ContradictionReport[];
  evidence_summary: ApiEvidenceSummaryEntry[];

  // ── Audit trail ───────────────────────────────────────────────────────────────
  /** Structured per-step orchestration log */
  audit_trail: ApiAuditStep[];

  // ── Legacy fields (existing UI depends on these) ──────────────────────────────
  consistencyScore:   number;
  auditTrail:         string[];   // triggered rule detail strings
  imageAiProbability?: number;
  textAiProbability?:  number;
};

// ── Response builder ──────────────────────────────────────────────────────────

/** Shape a completed DecisionRun into the canonical API response. */
export function buildClaimResponse(
  run:     DecisionRun,
  caseRef: string,
): ClaimAnalysisResponse {
  const decision      = run.policyDecision!;
  const risk          = run.riskAssessment;
  const fusionResult: SignalFusionResult | undefined = run.fusionResult;
  const job           = run.orchestrationJob;

  // ── Evidence summary from orchestration steps ──────────────────────────────
  const evidence_summary: ApiEvidenceSummaryEntry[] = [];
  if (job) {
    for (const step of job.steps) {
      if (!step.stepId.startsWith("evidence:")) continue;
      const meta = step.metadata ?? {};
      evidence_summary.push({
        artifactId:   (meta.artifactId as string) ?? step.stepId.replace("evidence:", ""),
        modality:     (meta.modality as ArtifactModality) ?? "text",
        signalCount:  (meta.signalCount as number) ?? 0,
        stepStatus:   step.status,
        skippedReason: step.skippedReason,
      });
    }
  }

  // ── Structured audit trail ─────────────────────────────────────────────────
  const audit_trail: ApiAuditStep[] = job
    ? job.steps.map((s) => ({
        stepId:    s.stepId,
        label:     s.label,
        status:    s.status,
        durationMs: s.durationMs,
        metadata:  s.metadata,
      }))
    : [];

  // ── Legacy auditTrail (rule detail strings) ────────────────────────────────
  const legacyAuditTrail = decision.matchedRules
    .filter((r) => r.triggered)
    .map((r) => r.detail);

  // ── Signal lists ───────────────────────────────────────────────────────────
  const signals      = fusionResult?.fusedSignals ?? risk?.signals ?? [];
  const contradictions = fusionResult?.contradictions ?? [];

  // ── Legacy per-modality probabilities (for RiskGauge in UI) ───────────────
  const imageAnalysis = run.artifactAnalyses.find((a) => a.agentId.includes("image"));
  const textAnalysis  = run.artifactAnalyses.find((a) => a.agentId.includes("text"));

  return {
    // Identity
    caseId:        run.caseId,
    caseRef,
    decisionRunId: run.id,

    // Decision
    decision:    decision.outcome,
    explanation: run.justification ?? decision.explanation,
    judgeSource: run.judgeSource ?? "demo",

    // Risk
    risk_score:  risk?.consistencyScore ?? 0,
    riskLevel:   risk?.riskLevel,

    // Actions
    actions: run.actions.map((a) => ({
      action:       a.action,
      status:       a.status,
      targetSystem: a.targetSystem,
      auditMessage: a.auditMessage,
    })),

    // Evidence
    signals,
    contradictions,
    evidence_summary,
    audit_trail,

    // Legacy
    consistencyScore:    risk?.consistencyScore ?? 0,
    auditTrail:          legacyAuditTrail,
    imageAiProbability:  imageAnalysis?.rawScore,
    textAiProbability:   textAnalysis?.rawScore,
  };
}
