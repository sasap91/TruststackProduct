/**
 * TrustStack domain types — single import point.
 *
 * import type { ClaimCase, NormalizedSignal, PolicyDecision, ... } from "@/lib/truststack/types";
 */

export type {
  ArtifactModality,
  ArtifactStatus,
  EvidenceArtifact,
  ArtifactAnalysis,
} from "./artifact";

export type {
  SignalFlag,
  SignalWeight,
  NormalizedSignal,
} from "./signal";

export type {
  RiskLevel,
  RiskAssessment,
} from "./risk";

export { toRiskLevel } from "./risk";

export type {
  DecisionOutcome,
  PolicyRuleMatch,
  PolicyDecision,
  PolicyConfig,
} from "./policy";

export type {
  ActionType,
  ActionStatus,
  ActionExecution,
} from "./action";

export type {
  RunStatus,
  DecisionRun,
} from "./run";

export type {
  CaseStatus,
  ClaimType,
  DeliveryStatus,
  ClaimCase,
} from "./case";
