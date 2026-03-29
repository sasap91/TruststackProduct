/**
 * PolicyReasoningProvider — optional nuanced policy judgment after rule engine.
 *
 * The deterministic PolicyAgent outcome is authoritative; this adapter supplies
 * supplemental narrative and structured hints for audit trails and future
 * merchant-specific packs. It must not silently override rule outcomes.
 *
 * Registered adapters:
 *   - NoOpPolicyReasoningProvider  (default — returns empty supplement)
 *   - LlmPolicyReasoningProvider    (future)
 */

import type {
  DecisionOutcome,
  PolicyConfig,
  PolicyReasoningHint,
} from "../types/policy";
import type { FusedSignal, SignalFusionResult } from "../types/fusion";
import type { RiskAssessment } from "../types/risk";

export type PolicyReasoningResult = {
  confidence: number;
  /** Appended to policy explanation when non-empty (human-readable only) */
  supplementalSummary?: string;
  nuances?: PolicyReasoningHint[];
};

export type PolicyReasoningInput = {
  outcome: DecisionOutcome;
  fusedSignals: FusedSignal[];
  fusionResult: SignalFusionResult;
  riskAssessment: RiskAssessment;
  claimDescription?: string;
  config?: PolicyConfig;
};

export interface PolicyReasoningProvider {
  readonly providerId: string;
  refine(input: PolicyReasoningInput): Promise<PolicyReasoningResult>;
}

export class NoOpPolicyReasoningProvider implements PolicyReasoningProvider {
  readonly providerId = "noop-policy-reasoning@1.0";

  async refine(_input: PolicyReasoningInput): Promise<PolicyReasoningResult> {
    return { confidence: 0, nuances: [] };
  }
}

export const defaultPolicyReasoningProvider: PolicyReasoningProvider =
  new NoOpPolicyReasoningProvider();
