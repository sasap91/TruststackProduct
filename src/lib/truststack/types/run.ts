/**
 * DecisionRun — a complete, auditable record of one analysis pass on a ClaimCase.
 *
 * A run captures every pipeline stage: artifact analyses, signal fusion,
 * policy evaluation, judge reasoning, and action execution. It is the unit
 * of replay — a run can be re-evaluated by changing policy config or
 * swapping agent implementations without re-uploading evidence.
 */

import type { ArtifactAnalysis } from "./artifact";
import type { RiskAssessment } from "./risk";
import type { PolicyDecision } from "./policy";
import type { ActionExecution } from "./action";
import type { SignalFusionResult } from "./fusion";
import type { OrchestrationJob } from "./orchestration";

export type RunStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "partial"; // some stages completed, some failed

export type DecisionRun = {
  id: string;
  caseId: string;
  status: RunStatus;

  // ── Pipeline stage outputs ─────────────────────────────────────────────────
  /** One entry per EvidenceArtifact analyzed */
  artifactAnalyses: ArtifactAnalysis[];
  /** Cross-modal fusion result: fused signals + contradictions + evidence strength */
  fusionResult?: SignalFusionResult;
  /** Category-weighted risk output */
  riskAssessment?: RiskAssessment;
  /** Policy decision with full rule trace */
  policyDecision?: PolicyDecision;
  /** Bounded actions taken or deferred */
  actions: ActionExecution[];

  // ── Judge output ───────────────────────────────────────────────────────────
  /** Human-readable justification from LLM judge or template fallback */
  justification?: string;
  judgeSource?: "claude" | "demo";

  // ── Iterative evidence loop ────────────────────────────────────────────────
  /**
   * Which analysis pass produced this run.
   * 1 = first run, 2+ = re-analysis after evidence re-submission.
   * Capped at MAX_ITERATIONS (3) in the orchestrator loop; the 4th attempt
   * force-escalates to human review.
   */
  iterationNumber?: number;

  // ── Audit context ──────────────────────────────────────────────────────────
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  /** userId, "api-key:<prefix>", or "system" */
  triggeredBy: string;
  /** Semver of the analysis pipeline, for reproducibility */
  pipelineVersion: string;

  /**
   * Full orchestration job — step-by-step audit trail.
   * Present when the run was produced by MultimodalClaimOrchestrator.
   * Absent on legacy pipeline runs.
   */
  orchestrationJob?: OrchestrationJob;
};
