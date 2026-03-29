/**
 * TrustStack evaluation & feedback foundation (fixtures, runner, hooks).
 */

export type {
  MultimodalEvalFixture,
  EvalExpectation,
  ExpectedSignalSpec,
  ExpectedContradictionSpec,
  EvalRunResult,
  EvalEvidenceSlot,
} from "./types";

export { buildEvalScenario, type BuiltEvalScenario } from "./fixture-builder";
export {
  runEvalScenario,
  runEvalSuite,
  setEvalCaptureHook,
  type EvalCaptureHook,
} from "./runner";

export {
  ScriptedVisionProvider,
  ScriptedTextReasoningProvider,
  visionStub,
  textReasoningStub,
  defaultTextReasoningResult,
} from "./stubs";

export {
  ALL_MULTIMODAL_EVAL_FIXTURES,
  scenarioClearDamagedStrongEvidence,
  scenarioLateMissingWeakEvidence,
  scenarioContradictoryMultimodal,
  scenarioHighValueNoVideo,
  scenarioRepeatClaimantSuspicious,
  scenarioDocumentMismatch,
} from "./fixtures/scenarios";

export {
  registerOutcomeFeedbackSink,
  emitOutcomeFeedback,
  recordHumanOverride,
  recordChargebackOrDisputeOutcome,
  type OutcomeFeedbackKind,
  type OutcomeFeedbackPayload,
  type OutcomeFeedbackSink,
} from "./feedback";

import { buildEvalScenario, type BuiltEvalScenario } from "./fixture-builder";
import { ALL_MULTIMODAL_EVAL_FIXTURES } from "./fixtures/scenarios";

/** All bundled scenarios as runnable built inputs */
export function buildAllEvalScenarios(): BuiltEvalScenario[] {
  return ALL_MULTIMODAL_EVAL_FIXTURES.map((f) => buildEvalScenario(f));
}
