/**
 * Run bundled multimodal eval fixtures (CI / local calibration).
 * Usage: npx tsx scripts/run-eval.ts
 */

import {
  buildAllEvalScenarios,
  runEvalScenario,
} from "../src/lib/truststack/eval/index";

async function main() {
  const built = buildAllEvalScenarios();
  let failed = 0;
  for (const b of built) {
    const r = await runEvalScenario(b);
    const ok = r.passed ? "OK" : "FAIL";
    console.log(
      `[${ok}] ${b.fixtureId} outcome=${r.actualOutcome} (expected ${b.expect.policyOutcome})`,
    );
    if (!r.passed) {
      failed++;
      if (r.signalMismatches.length) {
        console.log("  signalMismatches:", JSON.stringify(r.signalMismatches, null, 2));
      }
      if (r.contradictionMismatches.length) {
        console.log("  contradictionMismatches:", JSON.stringify(r.contradictionMismatches, null, 2));
      }
      if (r.evidenceStrengthMismatch) {
        console.log("  evidenceStrength:", r.evidenceStrengthMismatch);
      }
      if (r.extraContradictions?.length) {
        console.log("  extraContradictions:", r.extraContradictions);
      }
      console.log("  snapshot:", r.snapshot);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed}/${built.length} scenario(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${built.length} eval scenarios passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
