/**
 * TrustStack Decision Pipeline — backwards-compatible wrapper
 *
 * runDecisionPipeline() is the original flat entry point retained for
 * backwards compatibility with existing API routes. Internally it now
 * delegates to MultimodalClaimOrchestrator, which is the canonical
 * implementation.
 *
 * New callers should use claimOrchestrator.run() directly to get the
 * full OrchestratorResult including the OrchestrationJob audit trail.
 *
 * Stage order (documented here for reference — orchestrator owns execution):
 *   1. Evidence agents fan out in parallel (image / text / document / metadata)
 *   2. SignalFusionAgent — cross-modal reinforcement + contradiction detection
 *   3. RiskAgent — category-weighted scoring → RiskAssessment
 *   4. PolicyAgent — ordered rule evaluation → PolicyDecision
 *   5. JudgeAgent — human-readable explanation → PolicyDecision.explanation
 *   6. ActionAgent — bounded action list → ActionExecution[]
 */

import type { ClaimCase } from "./types/case";
import type { DecisionRun } from "./types/run";
import type { PolicyConfig } from "./types/policy";
import { claimOrchestrator } from "./orchestrator";
import type { TrustStackProviderDeps } from "./providers/truststack-providers";

export type PipelineInput = {
  claimCase: ClaimCase;
  /** Raw buffer for the primary image artifact (if present). */
  imageBuffer?: ArrayBuffer;
  policyConfig?: PolicyConfig;
  triggeredBy: string;
  providers?: TrustStackProviderDeps;
};

export async function runDecisionPipeline(input: PipelineInput): Promise<DecisionRun> {
  const { claimCase, imageBuffer, policyConfig, triggeredBy, providers } = input;

  // Convert the legacy single imageBuffer into the orchestrator's mediaBuffers map
  let mediaBuffers: Map<string, ArrayBuffer> | undefined;
  if (imageBuffer) {
    const imageArtifact = claimCase.evidence.find((e) => e.modality === "image");
    if (imageArtifact) {
      mediaBuffers = new Map([[imageArtifact.id, imageBuffer]]);
    }
  }

  const { run } = await claimOrchestrator.run({
    claimCase,
    mediaBuffers,
    policyConfig,
    triggeredBy,
    providers,
  });

  return run;
}
