/**
 * MultimodalClaimOrchestrator
 *
 * The primary entry point for processing a ClaimCase end-to-end.
 *
 * ── Responsibilities ─────────────────────────────────────────────────────────
 *   1. Ingest a ClaimCase and its media buffers
 *   2. Detect processing mode (sync vs async)
 *   3. Route each EvidenceArtifact to its modality agent
 *   4. Collect ArtifactAnalysis results and all signals
 *   5. Run SignalFusionAgent → FusionResult
 *   6. Run RiskAgent → RiskAssessment
 *   7. Run PolicyAgent → PolicyDecision
 *   8. Run JudgeAgent → fills PolicyDecision.explanation
 *   9. Run ActionAgent → ActionExecution[]
 *  10. Return DecisionRun with full audit trail + OrchestrationJob
 *
 * ── Processing modes ─────────────────────────────────────────────────────────
 *   sync  — text + metadata only; no external I/O; returns in < 100ms
 *   async — contains image / document / video artifacts; may call external
 *           providers; today runs in-process, tomorrow queue-extractable
 *
 * ── Error isolation ───────────────────────────────────────────────────────────
 *   Evidence stage:  per-artifact isolation — one agent failure doesn't abort
 *                    the run; the failed artifact's signals are omitted.
 *   Core stages:     fusion, risk, policy, actions — any failure aborts the run
 *                    and marks the job "failed". A partial DecisionRun is still
 *                    returned with status "failed" for diagnostics.
 *   Judge stage:     always falls back to a template on error (never aborts).
 *
 * ── Async-ready job model ─────────────────────────────────────────────────────
 *   Every run produces an OrchestrationJob with per-step status + timing.
 *   To evolve into queue-based processing:
 *     1. Persist the job to a DB before returning
 *     2. Replace the in-process execution below with a job-queue enqueue
 *     3. A worker picks up the job and replays the same execution sequence
 */

import { randomUUID } from "crypto";
import type { ClaimCase } from "./types/case";
import type { ArtifactAnalysis, ArtifactModality } from "./types/artifact";
import type { NormalizedSignal } from "./types/signal";
import type { SignalFusionResult } from "./types/fusion";
import type { RiskAssessment } from "./types/risk";
import type { PolicyDecision, PolicyConfig } from "./types/policy";
import type { ActionExecution } from "./types/action";
import type { DecisionRun } from "./types/run";
import type {
  OrchestrationJob,
  OrchestrationStep,
  StepStatus,
  ProcessingMode,
  JobStatus,
} from "./types/orchestration";

// Evidence agents
import {
  ImageEvidenceAgent,
  imageEvidenceAgent,
} from "./agents/evidence/image-evidence-agent";
import {
  TextEvidenceAgent,
  textEvidenceAgent,
} from "./agents/evidence/text-evidence-agent";
import {
  DocumentEvidenceAgent,
  documentEvidenceAgent,
} from "./agents/evidence/document-evidence-agent";
import { metadataEvidenceAgent, type OrderMetadata } from "./agents/evidence/metadata-evidence-agent";
import { velocityEvidenceAgent } from "./agents/evidence/velocity-evidence-agent";
import { getMerchantPolicy } from "@/lib/truststack-repo";
import type { PolicyAgentInput } from "./agents/policy-agent";

// Pipeline agents
import { signalFusionAgent } from "./agents/signal-fusion-agent";
import { riskAgent }         from "./agents/risk-agent";
import { PolicyAgent, policyAgent } from "./agents/policy-agent";

import type { TrustStackProviderDeps } from "./providers/truststack-providers";
import { defaultDocumentProvider } from "./providers/document-provider";
import { defaultOcrProvider } from "./providers/ocr-provider";
import { judgeAgent }        from "./agents/judge-agent";
import { actionAgent }       from "./agents/action-agent";

const ORCHESTRATOR_VERSION = "1.0.0";

// ── Input / output contracts ──────────────────────────────────────────────────

export type OrchestratorInput = {
  claimCase:    ClaimCase;
  /**
   * Map of artifactId → raw bytes for binary artifacts (images, documents).
   * If an image artifact has no entry here, its evidence agent is skipped.
   */
  mediaBuffers?: Map<string, ArrayBuffer>;
  policyConfig?: PolicyConfig;
  triggeredBy:  string;
  /**
   * Override the auto-detected processing mode.
   * Default: "sync" if only text/metadata present, "async" if image/document/video.
   */
  mode?: ProcessingMode;
  /**
   * Optional multimodal / reasoning backends. Omitted fields use mock or heuristic defaults.
   */
  providers?: TrustStackProviderDeps;
};

export type OrchestratorResult = {
  run: DecisionRun;
  job: OrchestrationJob;
};

// ── Step tracker ──────────────────────────────────────────────────────────────

class StepTracker {
  private readonly steps = new Map<string, OrchestrationStep>();

  register(stepId: string, label: string): void {
    this.steps.set(stepId, { stepId, label, status: "pending" });
  }

  start(stepId: string): void {
    this.update(stepId, { status: "running", startedAt: new Date() });
  }

  complete(stepId: string, metadata?: Record<string, unknown>): void {
    const step = this.steps.get(stepId);
    if (!step) return;
    const completedAt = new Date();
    this.update(stepId, {
      status:      "complete",
      completedAt,
      durationMs:  step.startedAt ? completedAt.getTime() - step.startedAt.getTime() : undefined,
      metadata,
    });
  }

  skip(stepId: string, reason: string): void {
    this.update(stepId, { status: "skipped", skippedReason: reason });
  }

  fail(stepId: string, error: unknown): void {
    const step = this.steps.get(stepId);
    if (!step) return;
    const completedAt = new Date();
    this.update(stepId, {
      status:      "failed",
      completedAt,
      durationMs:  step.startedAt ? completedAt.getTime() - step.startedAt.getTime() : undefined,
      error:       error instanceof Error ? error.message : String(error),
    });
  }

  list(): OrchestrationStep[] {
    return [...this.steps.values()];
  }

  private update(stepId: string, patch: Partial<OrchestrationStep>): void {
    const existing = this.steps.get(stepId);
    if (existing) this.steps.set(stepId, { ...existing, ...patch });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectMode(
  claimCase: ClaimCase,
  mediaBuffers?: Map<string, ArrayBuffer>,
): ProcessingMode {
  const hasHeavyArtifact = claimCase.evidence.some((a) => {
    if (a.modality === "video") return true;
    if (a.modality === "image" && mediaBuffers?.has(a.id)) return true;
    if (a.modality === "document" && a.content) return true;
    return false;
  });
  return hasHeavyArtifact ? "async" : "sync";
}

function evidenceStepId(artifactId: string): string {
  return `evidence:${artifactId}`;
}

function evidenceStepLabel(modality: ArtifactModality, artifactId: string): string {
  return `Evidence — ${modality} [${artifactId.slice(0, 8)}]`;
}

function orderMetadataFromClaimCase(claimCase: ClaimCase): OrderMetadata {
  return {
    refundRate:                 claimCase.refundRate,
    claimAgeHours:              claimCase.claimAgeHours,
    highValue:                  claimCase.highValue,
    hasVideoProof:              claimCase.hasVideoProof,
    deliveryStatus:             claimCase.deliveryStatus,
    claimType:                  claimCase.claimType,
    itemValueUsd:               claimCase.itemValueUsd,
    previousClaimsLast30Days:   claimCase.previousClaimsLast30Days,
    accountAgeDays:             claimCase.accountAgeDays,
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class MultimodalClaimOrchestrator {
  readonly orchestratorId = "multimodal-claim-orchestrator";
  readonly version        = ORCHESTRATOR_VERSION;

  /**
   * Run the full pipeline synchronously in-process.
   * Returns a DecisionRun + OrchestrationJob on completion.
   * Returns a partial DecisionRun + failed job if a core stage throws.
   */
  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const {
      claimCase,
      mediaBuffers,
      policyConfig = {},
      triggeredBy,
      mode: modeOverride,
      providers: providerDeps,
    } = input;

    const imageAgent = providerDeps?.vision
      ? new ImageEvidenceAgent(providerDeps.vision)
      : imageEvidenceAgent;
    const textAgent = providerDeps?.textReasoning
      ? new TextEvidenceAgent(providerDeps.textReasoning)
      : textEvidenceAgent;
    const documentAgent =
      providerDeps?.document !== undefined || providerDeps?.ocr !== undefined
        ? new DocumentEvidenceAgent(
            providerDeps.document ?? defaultDocumentProvider,
            providerDeps.ocr ?? defaultOcrProvider,
          )
        : documentEvidenceAgent;
    const policy = providerDeps?.policyReasoning
      ? new PolicyAgent(providerDeps.policyReasoning)
      : policyAgent;
    const jobId    = randomUUID();
    const runId    = randomUUID();
    const queuedAt = new Date();
    const mode     = modeOverride ?? detectMode(claimCase, mediaBuffers);

    // Load per-merchant policy (falls back to null → hardcoded defaults used)
    const merchantPolicy = await getMerchantPolicy(claimCase.userId).catch(() => null);

    // ── Register all steps upfront for full audit trail visibility ──────────
    const tracker = new StepTracker();

    for (const artifact of claimCase.evidence) {
      tracker.register(
        evidenceStepId(artifact.id),
        evidenceStepLabel(artifact.modality, artifact.id),
      );
    }
    // Always register a metadata step (built from ClaimCase fields)
    const hasExplicitMetadata = claimCase.evidence.some((a) => a.modality === "metadata");
    if (!hasExplicitMetadata) {
      const syntheticId = `${claimCase.id}-meta`;
      tracker.register(evidenceStepId(syntheticId), "Evidence — metadata [synthetic]");
    }
    tracker.register("fusion",   "Signal Fusion");
    tracker.register("risk",     "Risk Assessment");
    tracker.register("policy",   "Policy Evaluation");
    tracker.register("judge",    "Judge Explanation");
    tracker.register("actions",  "Action Execution");

    // ── Build base job ───────────────────────────────────────────────────────
    const startedAt = new Date();
    let jobStatus: JobStatus = "running";
    let jobError: string | undefined;

    // Mutable pipeline outputs — populated stage by stage
    const artifactAnalyses: ArtifactAnalysis[] = [];
    const allSignals: NormalizedSignal[]        = [];
    let fusionResult:   SignalFusionResult | undefined;
    let riskAssessment: RiskAssessment     | undefined;
    let policyDecision: PolicyDecision     | undefined;
    let judgeSource:    "claude" | "demo"  = "demo";
    let justification                      = "";
    let actions:        ActionExecution[]  = [];

    try {
      // ── Stage 1: Evidence agents (parallelised) ──────────────────────────
      await this.runEvidenceStage(
        claimCase,
        mediaBuffers,
        tracker,
        artifactAnalyses,
        allSignals,
        { image: imageAgent, text: textAgent, document: documentAgent },
      );

      // ── Stage 2: Signal fusion ───────────────────────────────────────────
      tracker.start("fusion");
      try {
        fusionResult = await signalFusionAgent.run({ signals: allSignals });
        tracker.complete("fusion", {
          inputSignalCount:  allSignals.length,
          fusedSignalCount:  fusionResult.fusedSignals.length,
          contradictionCount: fusionResult.contradictions.length,
          evidenceStrength:  fusionResult.evidenceStrength,
          modalitiesCovered: fusionResult.modalitiesCovered,
        });
      } catch (err) {
        tracker.fail("fusion", err);
        throw err; // fusion failure is non-recoverable
      }

      // ── Stage 3: Risk assessment ─────────────────────────────────────────
      tracker.start("risk");
      try {
        riskAssessment = await riskAgent.run({
          caseId: claimCase.id,
          fusionResult,
          weights: merchantPolicy?.riskWeights
            ? {
                fraud:          merchantPolicy.riskWeights.fraud,
                claimIntegrity: merchantPolicy.riskWeights.claimIntegrity,
                account:        merchantPolicy.riskWeights.account,
                procedural:     merchantPolicy.riskWeights.procedural,
              }
            : undefined,
        });
        tracker.complete("risk", {
          riskLevel:  riskAssessment.riskLevel,
          riskScore:  riskAssessment.consistencyScore,
        });
      } catch (err) {
        tracker.fail("risk", err);
        throw err;
      }

      // ── Stage 4: Policy evaluation ───────────────────────────────────────
      tracker.start("policy");
      try {
        // Merge merchant thresholds on top of any call-site policyConfig
        const effectivePolicyConfig: PolicyConfig = {
          ...policyConfig,
          ...(merchantPolicy && {
            autoApproveBelow:        merchantPolicy.autoApproveBelow,
            autoRejectAbove:         merchantPolicy.autoRejectAbove,
            highRefundRateThreshold: merchantPolicy.reviewBand?.high,
          }),
        };

        policyDecision = await policy.run({
          fusedSignals:     fusionResult.fusedSignals,
          fusionResult,
          riskAssessment,
          config:           effectivePolicyConfig,
          claimDescription: claimCase.description ?? "",
          merchantRules:    merchantPolicy?.customRules as PolicyAgentInput["merchantRules"],
        });
        tracker.complete("policy", {
          outcome:            policyDecision.outcome,
          triggeredRuleCount: policyDecision.matchedRules.filter((r) => r.triggered).length,
          totalRuleCount:     policyDecision.matchedRules.length,
          evidenceReferences: policyDecision.evidenceReferences,
          confidence:         policyDecision.confidence,
        });
      } catch (err) {
        tracker.fail("policy", err);
        throw err;
      }

      // ── Stage 5: Judge explanation (non-fatal on error) ──────────────────
      tracker.start("judge");
      try {
        const judgeOut = await judgeAgent.run({
          claimDescription: claimCase.description ?? "",
          risk:             riskAssessment,
          decision:         policyDecision,
          config:           policyConfig,
        });
        judgeSource    = judgeOut.judgeSource;
        justification  = judgeOut.justification;
        policyDecision.explanation = justification;
        tracker.complete("judge", { judgeSource });
      } catch (err) {
        // Non-fatal: use empty explanation, mark step failed but continue
        tracker.fail("judge", err);
        policyDecision.explanation = "";
      }

      // ── Stage 6: Actions ─────────────────────────────────────────────────
      tracker.start("actions");
      try {
        const actionOut = await actionAgent.run({
          caseId:         claimCase.id,
          decision:       policyDecision,
          riskAssessment,
          fusionResult,
        });
        actions = actionOut.actions;
        tracker.complete("actions", {
          actionCount: actions.length,
          actionTypes: actions.map((a) => a.action),
        });
      } catch (err) {
        tracker.fail("actions", err);
        throw err;
      }

      jobStatus = "complete";

    } catch (err) {
      jobStatus = "failed";
      jobError  = err instanceof Error ? err.message : String(err);
    }

    const completedAt = new Date();
    const durationMs  = completedAt.getTime() - startedAt.getTime();

    // ── Build OrchestrationJob ───────────────────────────────────────────────
    const job: OrchestrationJob = {
      jobId,
      runId:      jobStatus === "complete" ? runId : undefined,
      caseId:     claimCase.id,
      mode,
      status:     jobStatus,
      triggeredBy,
      queuedAt,
      startedAt,
      completedAt,
      durationMs,
      steps:      tracker.list(),
      error:      jobError,
      pipelineVersion: ORCHESTRATOR_VERSION,
    };

    // ── Build DecisionRun ────────────────────────────────────────────────────
    const runStatus = jobStatus === "complete" ? "complete" : "failed";
    const run: DecisionRun = {
      id:               runId,
      caseId:           claimCase.id,
      status:           runStatus,
      artifactAnalyses,
      fusionResult,
      riskAssessment,
      policyDecision,
      actions,
      justification,
      judgeSource,
      startedAt,
      completedAt,
      durationMs,
      triggeredBy,
      pipelineVersion:  ORCHESTRATOR_VERSION,
      orchestrationJob: job,
    };

    return { run, job };
  }

  /**
   * Async submission stub — for future queue integration.
   * Today it runs synchronously and returns the completed job.
   * Replace the body with a DB insert + queue enqueue when ready.
   */
  async submit(input: OrchestratorInput): Promise<OrchestrationJob> {
    const { job } = await this.run({ ...input, mode: "async" });
    return job;
  }

  // ── Evidence stage ─────────────────────────────────────────────────────────

  private async runEvidenceStage(
    claimCase:       ClaimCase,
    mediaBuffers:    Map<string, ArrayBuffer> | undefined,
    tracker:         StepTracker,
    analyses:        ArtifactAnalysis[],
    signals:         NormalizedSignal[],
    evidenceAgents:  {
      image:    ImageEvidenceAgent;
      text:     TextEvidenceAgent;
      document: DocumentEvidenceAgent;
    },
  ): Promise<void> {
    // Build task list: one task per artifact + always one for metadata
    const tasks: Array<() => Promise<void>> = [];

    // Determine if a synthetic metadata artifact is needed
    const hasExplicitMeta = claimCase.evidence.some((a) => a.modality === "metadata");
    const syntheticMetaId = `${claimCase.id}-meta`;

    // Metadata task (built from ClaimCase fields, always runs)
    if (!hasExplicitMeta) {
      const metaStepId = evidenceStepId(syntheticMetaId);
      const orderMetadata = orderMetadataFromClaimCase(claimCase);
      tasks.push(async () => {
        tracker.start(metaStepId);
        try {
          const out = await metadataEvidenceAgent.run({
            artifactId: syntheticMetaId,
            metadata:   orderMetadata,
          });
          analyses.push(out.analysis);
          signals.push(...out.signals);
          tracker.complete(metaStepId, {
            artifactId:  syntheticMetaId,
            modality:    "metadata",
            signalCount: out.signals.length,
          });
        } catch (err) {
          tracker.fail(metaStepId, err);
          // Non-fatal: continue without metadata signals
        }
      });
    }

    // Velocity task (always runs — queries DB for cross-claim behavioral patterns)
    const velocityStepId = evidenceStepId(`${claimCase.id}-velocity`);
    tasks.push(async () => {
      tracker.start(velocityStepId);
      try {
        const out = await velocityEvidenceAgent.run({
          artifactId:      `${claimCase.id}-velocity`,
          caseId:          claimCase.id,
          userId:          claimCase.userId,
          shippingAddress: claimCase.shippingAddress,
          email:           claimCase.email,
        });
        analyses.push(out.analysis);
        signals.push(...out.signals);
        tracker.complete(velocityStepId, {
          artifactId:  `${claimCase.id}-velocity`,
          modality:    "metadata",
          signalCount: out.signals.length,
        });
      } catch (err) {
        tracker.fail(velocityStepId, err);
        // Non-fatal: continue without velocity signals
      }
    });

    // Per-artifact tasks
    for (const artifact of claimCase.evidence) {
      const stepId = evidenceStepId(artifact.id);
      const task = this.buildArtifactTask(
        artifact,
        mediaBuffers,
        claimCase,
        tracker,
        stepId,
        analyses,
        signals,
        evidenceAgents,
      );
      tasks.push(task);
    }

    // Run all evidence tasks in parallel
    await Promise.all(tasks.map((t) => t()));
  }

  private buildArtifactTask(
    artifact:     import("./types/artifact").EvidenceArtifact,
    mediaBuffers: Map<string, ArrayBuffer> | undefined,
    claimCase:    ClaimCase,
    tracker:      StepTracker,
    stepId:       string,
    analyses:     ArtifactAnalysis[],
    signals:      NormalizedSignal[],
    evidenceAgents: {
      image:    ImageEvidenceAgent;
      text:     TextEvidenceAgent;
      document: DocumentEvidenceAgent;
    },
  ): () => Promise<void> {
    return async () => {
      switch (artifact.modality) {

        case "image": {
          const buffer = mediaBuffers?.get(artifact.id);
          if (!buffer) {
            tracker.skip(stepId, "No media buffer provided for image artifact.");
            return;
          }
          tracker.start(stepId);
          try {
            const out = await evidenceAgents.image.run({
              artifactId: artifact.id,
              buffer,
              mimeType:   artifact.mimeType,
            });
            analyses.push(out.analysis);
            signals.push(...out.signals);
            tracker.complete(stepId, {
              artifactId:  artifact.id,
              modality:    "image",
              signalCount: out.signals.length,
              provider:    out.analysis.provider ?? out.analysis.modelId,
            });
          } catch (err) {
            tracker.fail(stepId, err);
          }
          return;
        }

        case "text": {
          if (!artifact.content) {
            tracker.skip(stepId, "Text artifact has no content.");
            return;
          }
          tracker.start(stepId);
          try {
            const out = await evidenceAgents.text.run({
              artifactId: artifact.id,
              text:       artifact.content,
            });
            analyses.push(out.analysis);
            signals.push(...out.signals);
            tracker.complete(stepId, {
              artifactId:  artifact.id,
              modality:    "text",
              signalCount: out.signals.length,
              charCount:   artifact.content.length,
            });
          } catch (err) {
            tracker.fail(stepId, err);
          }
          return;
        }

        case "document": {
          if (!artifact.content) {
            tracker.skip(stepId, "Document artifact has no text content (binary not yet supported).");
            return;
          }
          tracker.start(stepId);
          try {
            const out = await evidenceAgents.document.run({
              artifactId:       artifact.id,
              content:          artifact.content,
              filename:         artifact.filename,
              mimeType:         artifact.mimeType,
              documentBuffer:   mediaBuffers?.get(artifact.id),
              claimedAmountUsd: claimCase.claimedAmountUsd,
            });
            analyses.push(out.analysis);
            signals.push(...out.signals);
            tracker.complete(stepId, {
              artifactId:  artifact.id,
              modality:    "document",
              signalCount: out.signals.length,
              filename:    artifact.filename,
            });
          } catch (err) {
            tracker.fail(stepId, err);
          }
          return;
        }

        case "metadata": {
          // Explicit metadata artifacts use claimCase fields (same as synthetic)
          const orderMetadata = orderMetadataFromClaimCase(claimCase);
          tracker.start(stepId);
          try {
            const out = await metadataEvidenceAgent.run({
              artifactId: artifact.id,
              metadata:   orderMetadata,
            });
            analyses.push(out.analysis);
            signals.push(...out.signals);
            tracker.complete(stepId, {
              artifactId:  artifact.id,
              modality:    "metadata",
              signalCount: out.signals.length,
            });
          } catch (err) {
            tracker.fail(stepId, err);
          }
          return;
        }

        case "video": {
          // Video agent not yet implemented
          tracker.skip(stepId, "Video evidence agent is not yet available. Artifact will not contribute signals.");
          return;
        }

        default: {
          tracker.skip(stepId, `Unknown modality "${(artifact as { modality: string }).modality}" — no agent registered.`);
        }
      }
    };
  }
}

export const claimOrchestrator = new MultimodalClaimOrchestrator();
