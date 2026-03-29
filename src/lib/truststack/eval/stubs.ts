/**
 * Scripted providers for evaluation — deterministic outputs, no vendor calls.
 */

import type { VisionProvider, VisionAnalysis } from "../providers/vision-provider";
import type {
  TextReasoningProvider,
  TextReasoningResult,
} from "../providers/text-reasoning-provider";

function defaultVisionAnalysis(): VisionAnalysis {
  return {
    visibleDamage:          { detected: false, confidence: 0.85, detail: "eval stub" },
    packagingCondition:     { detected: false, confidence: 0.8, detail: "eval stub" },
    missingItemCue:         { detected: false, confidence: 0.75, detail: "eval stub" },
    manipulationLikelihood: { detected: false, confidence: 0.85, detail: "eval stub" },
    imageQuality:           { score: 0.88, usableAsEvidence: true, detail: "eval stub" },
    overallConfidence:      0.85,
    notes:                  ["eval-scripted-vision: deterministic fixture output"],
  };
}

/** Vision adapter that always returns a fixed analysis (eval / golden replay). */
export class ScriptedVisionProvider implements VisionProvider {
  readonly providerId = "eval-scripted-vision@1.0";

  constructor(private readonly analysis: VisionAnalysis) {}

  async analyze(_buffer: ArrayBuffer, _mimeType: string): Promise<VisionAnalysis> {
    return structuredClone(this.analysis);
  }
}

export function visionStub(partial: Partial<VisionAnalysis>): VisionProvider {
  const base = defaultVisionAnalysis();
  const merged: VisionAnalysis = {
    ...base,
    ...partial,
    visibleDamage:          { ...base.visibleDamage, ...partial.visibleDamage },
    packagingCondition:     { ...base.packagingCondition, ...partial.packagingCondition },
    missingItemCue:         { ...base.missingItemCue, ...partial.missingItemCue },
    manipulationLikelihood: { ...base.manipulationLikelihood, ...partial.manipulationLikelihood },
    imageQuality:           { ...base.imageQuality, ...partial.imageQuality },
    notes:                  partial.notes ?? base.notes,
  };
  return new ScriptedVisionProvider(merged);
}

/** Text reasoning adapter with a fixed result. */
export class ScriptedTextReasoningProvider implements TextReasoningProvider {
  readonly providerId = "eval-scripted-text@1.0";

  constructor(private readonly result: TextReasoningResult) {}

  async analyze(_text: string): Promise<TextReasoningResult> {
    return structuredClone(this.result);
  }
}

/** Minimal valid TextReasoningResult for merging partials */
export function defaultTextReasoningResult(): TextReasoningResult {
  return {
    intents: {
      primary: "unclear",
      allMatched: [],
    },
    damageTermCount:     0,
    suspiciousPatternCount: 0,
    urgencyScore:        0,
    urgencyTier:         "low",
    overallConfidence:   0.8,
    notes:               ["eval default text reasoning"],
  };
}

export function textReasoningStub(partial: Partial<TextReasoningResult>): TextReasoningProvider {
  const base = defaultTextReasoningResult();
  return new ScriptedTextReasoningProvider({
    ...base,
    ...partial,
    intents: partial.intents
      ? { ...base.intents, ...partial.intents }
      : base.intents,
  });
}
