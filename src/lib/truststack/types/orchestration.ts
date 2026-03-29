/**
 * Orchestration types
 *
 * Models for per-step execution tracking, job lifecycle, and the async-ready
 * job envelope that wraps every MultimodalClaimOrchestrator run.
 *
 * Design intent:
 *   - OrchestrationStep captures one pipeline stage with timing and metadata.
 *   - OrchestrationJob is the queue-ready unit of work — today it completes
 *     in-process; tomorrow a worker can pick it up from a job queue.
 *   - ProcessingMode hints to callers and future workers how resource-intensive
 *     the job is ("sync" = text/metadata only; "async" = image/document/video).
 */

export type StepStatus =
  | "pending"    // registered but not yet started
  | "running"    // currently executing
  | "complete"   // finished successfully
  | "skipped"    // intentionally not executed (e.g. no artifact for modality)
  | "failed";    // threw an error — see OrchestrationStep.error

export type JobStatus =
  | "queued"     // created, waiting for a worker
  | "running"    // currently executing
  | "complete"   // all required stages finished successfully
  | "failed"     // a required stage failed — run may be partial
  | "cancelled"; // externally stopped before completion

/** Processing complexity hint */
export type ProcessingMode =
  | "sync"   // lightweight: text + metadata only, no external calls
  | "async"; // heavier: includes image / document / video artifacts

/** One tracked pipeline stage */
export type OrchestrationStep = {
  /** Stable step identifier — e.g. "evidence:abc123", "fusion", "risk" */
  stepId: string;

  /** Human-readable label for dashboards and logs */
  label: string;

  status: StepStatus;

  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;

  /** Populated when status = "skipped" */
  skippedReason?: string;

  /** Populated when status = "failed" */
  error?: string;

  /**
   * Stage-specific output metadata (counts, identifiers, etc.)
   * Not for heavy data — use signal lists / assessments in DecisionRun.
   *
   * Examples:
   *   evidence step:  { artifactId, modality, signalCount }
   *   fusion step:    { inputSignalCount, fusedSignalCount, contradictionCount, evidenceStrength }
   *   risk step:      { riskLevel, riskScore }
   *   policy step:    { outcome, triggeredRuleCount }
   *   judge step:     { judgeSource }
   *   actions step:   { actionCount, actionTypes }
   */
  metadata?: Record<string, unknown>;
};

/** The job envelope — today in-process, tomorrow queue-ready */
export type OrchestrationJob = {
  jobId: string;

  /**
   * Set when the DecisionRun is produced (stage "complete").
   * Null while running or if the job failed before producing a run.
   */
  runId?: string;

  caseId: string;

  /** Whether this job contains heavy (image/doc/video) artifacts */
  mode: ProcessingMode;

  status: JobStatus;

  triggeredBy: string;

  /** When the job was created / entered the queue */
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;

  /** Ordered list of all registered pipeline steps */
  steps: OrchestrationStep[];

  /**
   * Top-level error message when status = "failed".
   * Individual step errors are in OrchestrationStep.error.
   */
  error?: string;

  /** Pipeline version string for reproducibility */
  pipelineVersion: string;
};
