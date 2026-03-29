/**
 * SignalFusionAgent
 *
 * Cross-modal signal fusion layer. Takes the raw signal sets from all
 * modality-specific evidence agents and produces a FusedSignal list with:
 *
 *   1. Confidence reinforcement — when two independent modalities emit
 *      signals with the same key/flag, their confidence scores are combined
 *      using the independent-evidence formula: 1 - (1-cA)*(1-cB).
 *
 *   2. Contradiction detection — known cross-modal key pairs are checked.
 *      If two signals from different modalities carry opposing flags on
 *      semantically related keys, a ContradictionReport is raised.
 *
 *   3. Evidence strength — derived from modality coverage, contradiction
 *      count, and the proportion of high-confidence clean/risk signals.
 *
 *   4. Provenance preservation — every FusedSignal retains all source
 *      artifact IDs and records which keys corroborated or contradicted it.
 *
 * This agent is deterministic and makes no external calls.
 */

import type { Agent } from "./index";
import type { NormalizedSignal, SignalFlag } from "../types/signal";
import type { ArtifactModality } from "../types/artifact";
import type {
  FusedSignal,
  ContradictionReport,
  EvidenceStrength,
  SignalFusionResult,
} from "../types/fusion";

export type SignalFusionInput = {
  signals: NormalizedSignal[];
};

// ── Cross-modal corroboration pairs ──────────────────────────────────────────
// When signalA and signalB share the same flag, confidence is reinforced.
// When they carry opposing flags, a contradiction is raised.
type CorroborationPair = {
  aKey: string;
  bKey: string;
  contradictionSeverity: "strong" | "weak";
  contradictionDescription: (flagA: SignalFlag, flagB: SignalFlag) => string;
};

const CROSS_MODAL_PAIRS: CorroborationPair[] = [
  {
    aKey: "damage_claimed",
    bKey: "visible_damage",
    contradictionSeverity: "strong",
    contradictionDescription: (fA, fB) =>
      `Text claims damage (${fA}) but image evidence shows damage as ${fB} — direct visual contradiction.`,
  },
  {
    aKey: "damage_claimed",
    bKey: "packaging_damage",
    contradictionSeverity: "weak",
    contradictionDescription: (fA, fB) =>
      `Text claims damage (${fA}) but packaging inspection is ${fB} — supporting evidence absent.`,
  },
  {
    aKey: "claim_intent",
    bKey: "delivered_but_claimed_missing",
    contradictionSeverity: "strong",
    contradictionDescription: (fA, fB) =>
      `Claim intent is ${fA} but logistics conflict is ${fB} — carrier data contradicts claim narrative.`,
  },
  {
    aKey: "suspicious_language",
    bKey: "possible_image_manipulation",
    contradictionSeverity: "weak",
    contradictionDescription: (fA, fB) =>
      `Suspicious language (${fA}) combined with image manipulation signal (${fB}) — multi-modal fraud indicators.`,
  },
  {
    aKey: "claim_intent",
    bKey: "receipt_present",
    contradictionSeverity: "weak",
    contradictionDescription: (fA, fB) =>
      `Claim intent is ${fA} but document receipt check is ${fB}.`,
  },
  {
    aKey: "high_refund_rate",
    bKey: "suspicious_language",
    contradictionSeverity: "weak",
    contradictionDescription: (fA, fB) =>
      `High refund rate (${fA}) aligns with suspicious language (${fB}) — pattern reinforcement.`,
  },
];

// Flags considered opposing (contradiction)
function flagsContradict(fA: SignalFlag, fB: SignalFlag): boolean {
  return (fA === "risk" && fB === "clean") || (fA === "clean" && fB === "risk");
}

// Flags considered agreeing (corroboration)
function flagsAgree(fA: SignalFlag, fB: SignalFlag): boolean {
  return fA === fB && fA !== "neutral";
}

// Independent-evidence confidence reinforcement: 1 - (1-cA)*(1-cB)
function reinforce(cA: number, cB: number): number {
  return Math.min(1, 1 - (1 - cA) * (1 - cB));
}

export class SignalFusionAgent
  implements Agent<SignalFusionInput, SignalFusionResult>
{
  readonly agentId = "signal-fusion-agent";
  readonly version = "1.0.0";

  async run(input: SignalFusionInput): Promise<SignalFusionResult> {
    const { signals } = input;

    // Index signals by key for fast lookup
    const byKey = new Map<string, NormalizedSignal[]>();
    for (const s of signals) {
      const bucket = byKey.get(s.key) ?? [];
      bucket.push(s);
      byKey.set(s.key, bucket);
    }

    // Track per-key corroboration and contradiction lists
    const corroborates = new Map<string, string[]>(); // key → keys that corroborate
    const contradicts  = new Map<string, string[]>(); // key → keys that contradict
    const contradictionReports: ContradictionReport[] = [];

    for (const pair of CROSS_MODAL_PAIRS) {
      const aSignals = byKey.get(pair.aKey) ?? [];
      const bSignals = byKey.get(pair.bKey) ?? [];

      for (const sA of aSignals) {
        for (const sB of bSignals) {
          // Only cross-modal comparisons
          if (sA.sourceModality === sB.sourceModality) continue;

          if (flagsAgree(sA.flag, sB.flag)) {
            const ca = corroborates.get(pair.aKey) ?? [];
            if (!ca.includes(pair.bKey)) ca.push(pair.bKey);
            corroborates.set(pair.aKey, ca);

            const cb = corroborates.get(pair.bKey) ?? [];
            if (!cb.includes(pair.aKey)) cb.push(pair.aKey);
            corroborates.set(pair.bKey, cb);
          }

          if (flagsContradict(sA.flag, sB.flag)) {
            const da = contradicts.get(pair.aKey) ?? [];
            if (!da.includes(pair.bKey)) da.push(pair.bKey);
            contradicts.set(pair.aKey, da);

            const db = contradicts.get(pair.bKey) ?? [];
            if (!db.includes(pair.aKey)) db.push(pair.aKey);
            contradicts.set(pair.bKey, db);

            contradictionReports.push({
              signalA:    pair.aKey,
              signalB:    pair.bKey,
              modalityA:  sA.sourceModality,
              modalityB:  sB.sourceModality,
              severity:   pair.contradictionSeverity,
              description: pair.contradictionDescription(sA.flag, sB.flag),
            });
          }
        }
      }
    }

    // Build FusedSignals — one per source signal, confidence may be reinforced
    const fusedSignals: FusedSignal[] = signals.map((s) => {
      const corroboratedBy = corroborates.get(s.key) ?? [];
      const contradictedBy = contradicts.get(s.key)  ?? [];

      // Reinforce confidence if corroborated by any other modality
      let reinforcedConfidence = s.confidence;
      if (corroboratedBy.length > 0) {
        const partners = corroboratedBy
          .flatMap((key) => byKey.get(key) ?? [])
          .filter((p) => p.sourceModality !== s.sourceModality);

        for (const partner of partners) {
          reinforcedConfidence = reinforce(reinforcedConfidence, partner.confidence);
        }
      }

      const wasReinforced = reinforcedConfidence > s.confidence + 0.001;

      // Merge sourceArtifactIds from any same-key cross-modal signals
      const allArtifactIds = new Set(s.sourceArtifactIds);
      for (const key of [...corroboratedBy, ...contradictedBy]) {
        for (const partner of byKey.get(key) ?? []) {
          partner.sourceArtifactIds.forEach((id) => allArtifactIds.add(id));
        }
      }

      return {
        ...s,
        confidence:      reinforcedConfidence,
        sourceArtifactIds: [...allArtifactIds],
        fusedFromCount:  1, // each source signal starts as 1
        reinforced:      wasReinforced,
        corroboratedBy,
        contradictedBy,
      };
    });

    // Modality coverage
    const modalitiesCovered = [...new Set(signals.map((s) => s.sourceModality))] as ArtifactModality[];

    // Evidence strength
    const evidenceStrength = this.computeEvidenceStrength(
      fusedSignals,
      modalitiesCovered,
      contradictionReports,
    );

    // Claim-evidence consistency: 1 when no contradictions, penalty per contradiction
    const strongContradictions = contradictionReports.filter((c) => c.severity === "strong").length;
    const weakContradictions   = contradictionReports.filter((c) => c.severity === "weak").length;
    const consistencyPenalty   = Math.min(1, strongContradictions * 0.3 + weakContradictions * 0.1);
    const claimEvidenceConsistency = Math.max(0, 1 - consistencyPenalty);

    return {
      fusedSignals,
      contradictions: contradictionReports,
      evidenceStrength,
      claimEvidenceConsistency,
      modalitiesCovered,
    };
  }

  private computeEvidenceStrength(
    signals: FusedSignal[],
    modalities: ArtifactModality[],
    contradictions: ContradictionReport[],
  ): EvidenceStrength {
    const hasStrongContradiction = contradictions.some((c) => c.severity === "strong");

    // High-confidence signals (confidence >= 0.7) that aren't from placeholder
    const highConfSignals = signals.filter(
      (s) => s.confidence >= 0.7 && s.flag !== "neutral",
    );

    const modalityCount = modalities.length;

    // Insufficient: fewer than 2 modalities OR no high-confidence signals
    if (modalityCount < 2 || highConfSignals.length === 0) {
      return "insufficient";
    }

    // Strong: 3+ modalities, multiple high-confidence signals, no strong contradictions
    if (modalityCount >= 3 && highConfSignals.length >= 3 && !hasStrongContradiction) {
      return "strong";
    }

    // Weak: strong contradiction present OR very few high-confidence signals
    if (hasStrongContradiction || highConfSignals.length < 2) {
      return "weak";
    }

    return "moderate";
  }
}

export const signalFusionAgent = new SignalFusionAgent();
