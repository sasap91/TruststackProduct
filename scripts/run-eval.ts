/**
 * Run the full benchmark eval suite.
 * Usage: npx tsx scripts/run-eval.ts
 *        npm run eval
 */

import { runBenchmarkAndWrite } from "../src/lib/truststack/eval/benchmark";

async function main() {
  console.log("TrustStack Eval Benchmark\n");

  const results = await runBenchmarkAndWrite();

  const { fraudDetection: fd, passRate } = results;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Fixture results:  ${results.passed}/${results.totalFixtures} passed (${(passRate * 100).toFixed(1)}%)`);
  console.log(`\nFraud-detection metrics (positive = reject | review):`);
  console.log(`  Precision : ${(fd.precision * 100).toFixed(1)}%`);
  console.log(`  Recall    : ${(fd.recall    * 100).toFixed(1)}%`);
  console.log(`  F1        : ${(fd.f1        * 100).toFixed(1)}%`);
  console.log(`  TP=${fd.tp}  FP=${fd.fp}  FN=${fd.fn}  TN=${fd.tn}`);

  console.log(`\nOutcome accuracy breakdown:`);
  for (const [outcome, { expected, correct, accuracy }] of Object.entries(results.outcomeAccuracy)) {
    const bar = "█".repeat(Math.round(accuracy * 10)).padEnd(10);
    console.log(`  ${outcome.padEnd(25)} ${correct}/${expected}  ${bar}  ${(accuracy * 100).toFixed(0)}%`);
  }

  if (results.failed > 0) {
    console.log(`\nFailed fixtures:`);
    for (const f of results.fixtures.filter((x) => !x.passed)) {
      console.log(`  • ${f.id}`);
      for (const reason of f.failureReasons) {
        console.log(`      ${reason}`);
      }
    }
  }

  console.log(`\nResults written to src/lib/truststack/eval/results/benchmark-results.json`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
