/**
 * TrustStack — public module entry point
 *
 * import { runDecisionPipeline, type ClaimCase, type NormalizedSignal } from "@/lib/truststack";
 */

// Domain types
export type {
  ArtifactModality,
  ArtifactStatus,
  EvidenceArtifact,
  ArtifactAnalysis,
} from "./types/artifact";

export type { SignalFlag, SignalWeight, NormalizedSignal } from "./types/signal";

export type { RiskLevel, RiskAssessment } from "./types/risk";
export { toRiskLevel } from "./types/risk";

export type {
  DecisionOutcome,
  PolicyRuleMatch,
  PolicyDecision,
  PolicyConfig,
  PolicyReasoningHint,
} from "./types/policy";

export type {
  ActionType,
  ActionStatus,
  ActionExecution,
} from "./types/action";

export type { RunStatus, DecisionRun } from "./types/run";

export type {
  StepStatus,
  JobStatus,
  ProcessingMode,
  OrchestrationStep,
  OrchestrationJob,
} from "./types/orchestration";

export type {
  CaseStatus,
  ClaimType,
  DeliveryStatus,
  ClaimCase,
} from "./types/case";

// Agent interface
export type { Agent, AgentResult } from "./agents/index";
export { runAgent } from "./agents/index";

// Evidence agents (modality-specific)
export { textEvidenceAgent }     from "./agents/evidence/text-evidence-agent";
export { imageEvidenceAgent }    from "./agents/evidence/image-evidence-agent";
export { documentEvidenceAgent } from "./agents/evidence/document-evidence-agent";
export { metadataEvidenceAgent } from "./agents/evidence/metadata-evidence-agent";
export type { OrderMetadata }    from "./agents/evidence/metadata-evidence-agent";

// Fusion + risk types
export type {
  FusedSignal,
  ContradictionReport,
  EvidenceStrength,
  SignalFusionResult,
} from "./types/fusion";

// Pipeline agents
export { signalFusionAgent } from "./agents/signal-fusion-agent";
export { riskAgent }         from "./agents/risk-agent";
export { policyAgent }       from "./agents/policy-agent";
export { actionAgent }       from "./agents/action-agent";
export { judgeAgent }        from "./agents/judge-agent";
// Legacy agents (kept for compatibility)
export { riskAssessmentEngine } from "./agents/risk-engine";
export { policyEngine }         from "./agents/policy-engine";

// Providers (for swapping — vendor-agnostic contracts + mock defaults)
export type { ImageAnalysisProvider, ImageAnalysisResult } from "./providers/image-provider";
export type {
  VisionProvider,
  VisionAnalysis,
  VisionFinding,
} from "./providers/vision-provider";
export {
  DemoVisionProvider,
  defaultVisionProvider,
  wrapLegacyProvider,
} from "./providers/vision-provider";
export type {
  OCRProvider,
  OcrExtraction,
  OcrBlock,
  OcrDocumentKind,
  OcrInput,
} from "./providers/ocr-provider";
export { MockOcrProvider, defaultOcrProvider } from "./providers/ocr-provider";
export type {
  TextReasoningProvider,
  TextReasoningResult,
  ClaimIntentLabel,
  UrgencyTier,
} from "./providers/text-reasoning-provider";
export {
  HeuristicTextReasoningProvider,
  defaultTextReasoningProvider,
} from "./providers/text-reasoning-provider";
export type {
  PolicyReasoningProvider,
  PolicyReasoningInput,
  PolicyReasoningResult,
} from "./providers/policy-reasoning-provider";
export {
  NoOpPolicyReasoningProvider,
  defaultPolicyReasoningProvider,
} from "./providers/policy-reasoning-provider";
export type { DocumentProvider, DocumentExtraction } from "./providers/document-provider";
export type { TrustStackProviderDeps } from "./providers/truststack-providers";

// PolicyAgent types (for merchant rule customisation)
export { defineRule } from "./agents/policy-agent";
export type { PolicyAgentInput, PolicyAgentOutput } from "./agents/policy-agent";
export type { ActionAgentInput, ActionAgentOutput } from "./agents/action-agent";

// Orchestrator (primary entry point)
export {
  MultimodalClaimOrchestrator,
  claimOrchestrator,
} from "./orchestrator";
export type { OrchestratorInput, OrchestratorResult } from "./orchestrator";

// HTTP API bridge (request parsing, response shaping)
export {
  generateCaseRef,
  buildClaimCase,
  buildClaimResponse,
  outcomeToDbStatus,
} from "./api";
export type {
  ClaimRequestFields,
  ClaimAnalysisResponse,
  ApiAction,
  ApiEvidenceSummaryEntry,
  ApiAuditStep,
} from "./api";

// Pipeline (backwards-compatible wrapper around orchestrator)
export { runDecisionPipeline, type PipelineInput } from "./pipeline";

// Evaluation & outcome feedback (fixtures, harness, hooks)
export {
  buildEvalScenario,
  buildAllEvalScenarios,
  runEvalScenario,
  runEvalSuite,
  setEvalCaptureHook,
  registerOutcomeFeedbackSink,
  emitOutcomeFeedback,
  recordHumanOverride,
  recordChargebackOrDisputeOutcome,
  ALL_MULTIMODAL_EVAL_FIXTURES,
} from "./eval/index";
export type {
  MultimodalEvalFixture,
  EvalExpectation,
  EvalRunResult,
  BuiltEvalScenario,
  OutcomeFeedbackPayload,
  OutcomeFeedbackSink,
  EvalCaptureHook,
} from "./eval/index";
