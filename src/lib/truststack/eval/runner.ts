/**
 * Evaluation runner — executes fixtures through the orchestrator and diffs expectations.
 */

import { claimOrchestrator } from "../orchestrator";
import type { FusedSignal } from "../types/fusion";
import type { ContradictionReport } from "../types/fusion";
import type { EvalRunResult, ExpectedSignalSpec, ExpectedContradictionSpec } from "./types";
import type { BuiltEvalScenario } from "./fixture-builder";

export type EvalCaptureHook = (
  result: EvalRunResult,
  built: BuiltEvalScenario,
) => void | Promise<void>;

let evalCaptureHook: EvalCaptureHook | undefined;

/** Optional hook to persist eval runs (DB, JSONL, PostHog) for replay dashboards */
export function setEvalCaptureHook(hook: EvalCaptureHook | undefined): void {
  evalCaptureHook = hook;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function signalMatches(spec: ExpectedSignalSpec, s: FusedSignal): boolean {
  if (spec.flag !== undefined) {
    const allowed = Array.isArray(spec.flag) ? spec.flag : [spec.flag];
    if (!allowed.includes(s.flag)) return false;
  }
  if (spec.minConfidence !== undefined && s.confidence < spec.minConfidence) {
    return false;
  }
  return true;
}

function findContradiction(
  reports: ContradictionReport[],
  spec: ExpectedContradictionSpec,
): ContradictionReport | undefined {
  const want = pairKey(spec.keys[0], spec.keys[1]);
  return reports.find((c) => {
    const pk = pairKey(c.signalA, c.signalB);
    if (pk !== want) return false;
    if (spec.severity !== undefined && c.severity !== spec.severity) return false;
    return true;
  });
}

/**
 * Run a built scenario through MultimodalClaimOrchestrator and evaluate expectations.
 */
export async function runEvalScenario(
  built: BuiltEvalScenario,
): Promise<EvalRunResult> {
  const { run } = await claimOrchestrator.run({
    claimCase:     built.claimCase,
    mediaBuffers:  built.mediaBuffers,
    policyConfig:  {},
    triggeredBy:   "eval-harness",
    providers:     built.providers,
  });

  const expectedOutcome = built.expect.policyOutcome;
  const base: EvalRunResult = {
    fixtureId:               built.fixtureId,
    passed:                  false,
    actualOutcome:           run.policyDecision?.outcome ?? null,
    expectedOutcome,
    signalMismatches:        [],
    contradictionMismatches: [],
    runId:                   run.id,
  };

  if (run.status !== "complete" || !run.fusionResult || !run.policyDecision) {
    return {
      ...base,
      passed: false,
      signalMismatches: [
        {
          spec:   { key: "(pipeline)" },
          reason: `Run incomplete or missing fusion/policy: status=${run.status}`,
        },
      ],
    };
  }

  const fused          = run.fusionResult.fusedSignals;
  const contradictions = run.fusionResult.contradictions;
  const signalMismatches: EvalRunResult["signalMismatches"]        = [];
  const contradictionMismatches: EvalRunResult["contradictionMismatches"] = [];

  for (const spec of built.expect.signals) {
    const candidates = fused.filter((s) => s.key === spec.key);
    if (candidates.length === 0) {
      signalMismatches.push({
        spec,
        reason: `No fused signal with key "${spec.key}"`,
      });
      continue;
    }
    if (!candidates.some((s) => signalMatches(spec, s))) {
      signalMismatches.push({
        spec,
        reason: `Key "${spec.key}" present but no variant matched flag/confidence: ${JSON.stringify(
          candidates.map((c) => ({ flag: c.flag, confidence: c.confidence })),
        )}`,
      });
    }
  }

  for (const spec of built.expect.contradictions) {
    const hit = findContradiction(contradictions, spec);
    if (!hit) {
      contradictionMismatches.push({
        spec,
        reason: `No contradiction for keys ${spec.keys[0]} / ${spec.keys[1]}${spec.severity ? ` (severity ${spec.severity})` : ""}`,
      });
    }
  }

  let evidenceStrengthMismatch: EvalRunResult["evidenceStrengthMismatch"];
  if (built.expect.evidenceStrength !== undefined) {
    const actual = run.fusionResult.evidenceStrength;
    if (actual !== built.expect.evidenceStrength) {
      evidenceStrengthMismatch = {
        expected: built.expect.evidenceStrength,
        actual,
      };
    }
  }

  let extraContradictions: string[] | undefined;
  if (built.expect.strictContradictions) {
    const allowed = new Set(
      built.expect.contradictions.map((c) => pairKey(c.keys[0], c.keys[1])),
    );
    const extras: string[] = [];
    for (const c of contradictions) {
      const pk = pairKey(c.signalA, c.signalB);
      if (!allowed.has(pk)) extras.push(pk);
    }
    if (extras.length > 0) extraContradictions = extras;
  }

  const outcomeOk = run.policyDecision.outcome === expectedOutcome;
  const strengthOk = !evidenceStrengthMismatch;
  const extraOk    = !extraContradictions?.length;

  const passed =
    signalMismatches.length === 0 &&
    contradictionMismatches.length === 0 &&
    outcomeOk &&
    strengthOk &&
    extraOk;

  const result: EvalRunResult = {
    ...base,
    passed,
    actualOutcome: run.policyDecision.outcome,
    signalMismatches,
    contradictionMismatches,
    evidenceStrengthMismatch,
    extraContradictions,
    snapshot: {
      fusedSignalKeys:      [...new Set(fused.map((s) => s.key))],
      contradictionPairs:   contradictions.map((c) => pairKey(c.signalA, c.signalB)),
      riskLevel:            run.riskAssessment?.riskLevel,
      consistencyScore:     run.riskAssessment?.consistencyScore,
    },
  };

  if (evalCaptureHook) {
    try {
      await evalCaptureHook(result, built);
    } catch {
      /* capture is best-effort */
    }
  }

  return result;
}

/** Run multiple built scenarios; returns aggregate pass count */
export async function runEvalSuite(
  scenarios: BuiltEvalScenario[],
): Promise<{ results: EvalRunResult[]; passedCount: number; failedCount: number }> {
  const results: EvalRunResult[] = [];
  for (const s of scenarios) {
    results.push(await runEvalScenario(s));
  }
  const passedCount = results.filter((r) => r.passed).length;
  return {
    results,
    passedCount,
    failedCount: results.length - passedCount,
  };
}
