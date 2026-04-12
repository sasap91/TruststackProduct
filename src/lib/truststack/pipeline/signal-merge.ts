/**
 * TrustStack pipeline — signal merge.
 *
 * Assembles the four LLM step outputs into a single MergedSignals object
 * that is the sole input surface for the policy engine.
 */

import type { ClassifierOutput } from "../types/claim";
import type { VisualSignals, TextSignals, ConsistencySignals, MergedSignals } from "../types/signals";

export function mergeSignals(
  classifier:   ClassifierOutput,
  visual:       VisualSignals,
  text:         TextSignals,
  consistency:  ConsistencySignals,
): MergedSignals {
  return { classifier, visual, text, consistency };
}
