/**
 * benchmark.ts
 *
 * Loads all fixtures, runs each through the orchestrator in demo mode
 * (scripted providers — no real API calls), and computes fraud-detection
 * precision, recall, and F1.
 *
 * Fraud detection framing:
 *   Positive class ("flagged") = outcome is "reject" or "review"
 *   Negative class             = outcome is "approve" or "request_more_evidence"
 *
 *   TP — predicted flagged, expected flagged
 *   FP — predicted flagged, expected not-flagged
 *   FN — predicted not-flagged, expected flagged
 *   TN — predicted not-flagged, expected not-flagged
 *
 *   Precision = TP / (TP + FP)
 *   Recall    = TP / (TP + FN)
 *   F1        = 2·P·R / (P + R)
 *
 * Output is written to src/lib/truststack/eval/results/benchmark-results.json.
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { buildEvalScenario } from "./fixture-builder";
import { runEvalScenario } from "./runner";
import { ALL_MULTIMODAL_EVAL_FIXTURES } from "./fixtures/scenarios";
import type { EvalRunResult } from "./types";

export type BenchmarkFixtureSummary = {
  id:              string;
  name:            string;
  passed:          boolean;
  expectedOutcome: string;
  actualOutcome:   string | null;
  expectedFlagged: boolean;
  predictedFlagged: boolean;
  riskLevel?:      string;
  consistencyScore?: number;
  signalKeys:      string[];
  failureReasons:  string[];
};

export type BenchmarkResults = {
  runAt:             string;
  totalFixtures:     number;
  passed:            number;
  failed:            number;
  passRate:          number;

  /** Fraud-detection classification metrics */
  fraudDetection: {
    precision:  number;
    recall:     number;
    f1:         number;
    tp:         number;
    fp:         number;
    fn:         number;
    tn:         number;
    support:    { positive: number; negative: number };
  };

  /** Outcome distribution — actual vs expected */
  outcomeAccuracy: Record<string, { expected: number; correct: number; accuracy: number }>;

  fixtures: BenchmarkFixtureSummary[];
};

const FLAGGED_OUTCOMES = new Set(["reject", "review", "flag"]);

function isFlagged(outcome: string | null): boolean {
  return outcome != null && FLAGGED_OUTCOMES.has(outcome);
}

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Run all fixtures and return structured benchmark results.
 */
export async function runBenchmark(): Promise<BenchmarkResults> {
  const fixtures = ALL_MULTIMODAL_EVAL_FIXTURES;
  const results: EvalRunResult[] = [];

  process.stdout.write(`Running ${fixtures.length} fixtures…\n`);

  for (const fixture of fixtures) {
    const built = buildEvalScenario(fixture);
    const result = await runEvalScenario(built);
    results.push(result);

    const status = result.passed ? "PASS" : "FAIL";
    const outcome = result.actualOutcome ?? "null";
    process.stdout.write(`  [${status}] ${fixture.id.padEnd(45)} actual=${outcome} expected=${fixture.expect.policyOutcome}\n`);
  }

  // ── Confusion matrix ──────────────────────────────────────────────────────
  let tp = 0, fp = 0, fn = 0, tn = 0;

  // ── Outcome accuracy ──────────────────────────────────────────────────────
  const outcomeAcc: Record<string, { expected: number; correct: number }> = {};

  const summaries: BenchmarkFixtureSummary[] = results.map((r, i) => {
    const fixture = fixtures[i];
    const expected = fixture.expect.policyOutcome;
    const actual   = r.actualOutcome;

    const expectedFlagged  = isFlagged(expected);
    const predictedFlagged = isFlagged(actual);

    if (expectedFlagged  && predictedFlagged)  tp++;
    else if (!expectedFlagged && predictedFlagged)  fp++;
    else if (expectedFlagged  && !predictedFlagged) fn++;
    else tn++;

    if (!outcomeAcc[expected]) outcomeAcc[expected] = { expected: 0, correct: 0 };
    outcomeAcc[expected].expected++;
    if (actual === expected) outcomeAcc[expected].correct++;

    const failureReasons: string[] = [
      ...(r.signalMismatches.map((m) => `signal mismatch: ${m.spec.key} — ${m.reason}`)),
      ...(r.contradictionMismatches.map((m) => `contradiction mismatch: ${m.spec.keys.join("/")} — ${m.reason}`)),
      ...(r.evidenceStrengthMismatch
        ? [`evidence strength: expected ${r.evidenceStrengthMismatch.expected}, got ${r.evidenceStrengthMismatch.actual}`]
        : []),
      ...(r.actualOutcome !== expected ? [`outcome: expected ${expected}, got ${actual}`] : []),
    ];

    return {
      id:               fixture.id,
      name:             fixture.name,
      passed:           r.passed,
      expectedOutcome:  expected,
      actualOutcome:    actual,
      expectedFlagged,
      predictedFlagged,
      riskLevel:        r.snapshot?.riskLevel,
      consistencyScore: r.snapshot?.consistencyScore,
      signalKeys:       r.snapshot?.fusedSignalKeys ?? [],
      failureReasons,
    };
  });

  // ── Derived metrics ───────────────────────────────────────────────────────
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;

  const outcomeAccuracy = Object.fromEntries(
    Object.entries(outcomeAcc).map(([outcome, { expected, correct }]) => [
      outcome,
      { expected, correct, accuracy: expected > 0 ? correct / expected : 0 },
    ]),
  );

  const passed = results.filter((r) => r.passed).length;

  return {
    runAt:         new Date().toISOString(),
    totalFixtures: fixtures.length,
    passed,
    failed:        fixtures.length - passed,
    passRate:      passed / fixtures.length,
    fraudDetection: {
      precision,
      recall,
      f1:      f1(precision, recall),
      tp, fp, fn, tn,
      support: {
        positive: tp + fn,  // total actually flagged
        negative: tn + fp,  // total actually not-flagged
      },
    },
    outcomeAccuracy,
    fixtures: summaries,
  };
}

/**
 * Run the benchmark and write results to disk.
 * Call this from scripts/run-benchmark.ts or npm run eval.
 */
export async function runBenchmarkAndWrite(
  outputPath?: string,
): Promise<BenchmarkResults> {
  const results = await runBenchmark();

  const resultsDir = outputPath
    ? join(outputPath, "..")
    : join(process.cwd(), "src/lib/truststack/eval/results");

  const filePath = outputPath
    ?? join(resultsDir, "benchmark-results.json");

  await mkdir(resultsDir, { recursive: true });
  await writeFile(filePath, JSON.stringify(results, null, 2), "utf8");

  return results;
}
