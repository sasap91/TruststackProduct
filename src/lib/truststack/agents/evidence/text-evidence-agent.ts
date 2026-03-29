/**
 * TextEvidenceAgent
 *
 * Semantic analysis of claim text is delegated to TextReasoningProvider.
 * Swap heuristics for an LLM or classifier without changing downstream stages.
 *
 * Emitted signals:
 *   claim_intent          — what type of claim the text describes
 *   damage_claimed        — explicit physical damage language present
 *   suspicious_language   — template/scripted/unusually formal phrasing
 *   urgency_level         — pressure/escalation language detected
 */

import type { Agent } from "../index";
import type { ArtifactAnalysis } from "../../types/artifact";
import type { NormalizedSignal } from "../../types/signal";
import type {
  TextReasoningProvider,
  TextReasoningResult,
} from "../../providers/text-reasoning-provider";
import { defaultTextReasoningProvider } from "../../providers/text-reasoning-provider";
import { signal, EXTRACTOR } from "./shared";

export type TextEvidenceInput = {
  artifactId: string;
  text: string;
};

export type TextEvidenceOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

export class TextEvidenceAgent implements Agent<TextEvidenceInput, TextEvidenceOutput> {
  readonly agentId = "text-evidence-agent";
  readonly version = "1.1.0";

  constructor(
    private readonly reasoning: TextReasoningProvider = defaultTextReasoningProvider,
  ) {}

  async run(input: TextEvidenceInput): Promise<TextEvidenceOutput> {
    const { artifactId, text } = input;
    const start = Date.now();

    const r = await this.reasoning.analyze(text);
    const signals: NormalizedSignal[] = [
      this.claimIntentSignal(artifactId, r),
      this.damageClaimedSignal(artifactId, r),
      this.suspiciousLanguageSignal(artifactId, r),
      this.urgencyLevelSignal(artifactId, r),
    ];

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId: this.agentId,
      modelId: this.reasoning.providerId,
      provider: undefined,
      rawScore: undefined,
      notes: r.notes,
      durationMs: Date.now() - start,
      completedAt: new Date(),
    };

    return { analysis, signals };
  }

  private claimIntentSignal(artifactId: string, r: TextReasoningResult): NormalizedSignal {
    const { primary, allMatched } = r.intents;
    const multi = allMatched.length > 1;

    return signal({
      key: "claim_intent",
      value: multi
        ? `Multiple intents: ${allMatched.join(", ")}`
        : `Intent: ${primary}`,
      flag: multi ? "neutral" : primary === "unclear" ? "neutral" : "clean",
      weight: "high",
      confidence: r.overallConfidence,
      artifactId,
      modality: "text",
      extractor: EXTRACTOR.text,
      rationale: multi
        ? "Claim text matches multiple intent categories — may indicate scope creep or templated submission."
        : primary === "unclear"
          ? "No clear claim intent detected in text."
          : `Claim intent identified as: ${primary}.`,
    });
  }

  private damageClaimedSignal(artifactId: string, r: TextReasoningResult): NormalizedSignal {
    const unique = r.damageTermCount;
    const hasDamage = unique > 0;

    return signal({
      key: "damage_claimed",
      value: hasDamage
        ? `${unique} distinct damage term${unique > 1 ? "s" : ""} detected`
        : "No damage language detected",
      flag: hasDamage ? (unique >= 4 ? "risk" : "neutral") : "clean",
      weight: "high",
      rawScore: Math.min(1, unique / 6),
      confidence: hasDamage ? Math.min(0.9, 0.5 + unique * 0.1) : 0.85,
      artifactId,
      modality: "text",
      extractor: EXTRACTOR.text,
      rationale:
        unique >= 4
          ? `${unique} damage terms suggest possible exaggeration or templated claim.`
          : hasDamage
            ? "Physical damage explicitly described in claim text."
            : "No explicit damage language found in claim text.",
    });
  }

  private suspiciousLanguageSignal(artifactId: string, r: TextReasoningResult): NormalizedSignal {
    const count = r.suspiciousPatternCount;
    const isSuspicious = count >= 2;

    return signal({
      key: "suspicious_language",
      value:
        count > 0
          ? `${count} formal/template pattern${count > 1 ? "s" : ""} detected`
          : "No suspicious language patterns detected",
      flag: isSuspicious ? "risk" : count === 1 ? "neutral" : "clean",
      weight: "medium",
      rawScore: Math.min(1, count / 4),
      confidence: count >= 3 ? 0.85 : count >= 1 ? 0.65 : 0.75,
      artifactId,
      modality: "text",
      extractor: EXTRACTOR.text,
      rationale: isSuspicious
        ? "Multiple formal/legal/template phrases suggest a scripted or AI-assisted claim submission."
        : count === 1
          ? "One formal phrase detected — not necessarily suspicious in isolation."
          : "Claim language appears natural and unscripted.",
    });
  }

  private urgencyLevelSignal(artifactId: string, r: TextReasoningResult): NormalizedSignal {
    const score = r.urgencyScore;
    const level = r.urgencyTier;

    return signal({
      key: "urgency_level",
      value: `Urgency: ${level}`,
      flag: level === "high" ? "risk" : level === "medium" ? "neutral" : "clean",
      weight: level === "high" ? "high" : "low",
      rawScore: score,
      confidence:
        level === "high" ? 0.9 : level === "medium" ? 0.75 : 0.8,
      artifactId,
      modality: "text",
      extractor: EXTRACTOR.text,
      rationale:
        level === "high"
          ? "High-urgency or legal-threat language detected — may indicate pressure tactic or coaching."
          : level === "medium"
            ? "Moderate urgency language — within normal range but worth noting."
            : "No significant urgency language detected.",
    });
  }
}

export const textEvidenceAgent = new TextEvidenceAgent();
