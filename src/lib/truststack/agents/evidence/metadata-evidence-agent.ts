/**
 * MetadataEvidenceAgent
 *
 * Analyzes structured order and customer context signals.
 * No external calls — pure deterministic analysis of typed metadata.
 *
 * This agent replaces the inline metadata signal generation previously
 * embedded in the RiskAssessmentEngine, giving metadata a proper agent
 * boundary and a typed, extensible input contract.
 *
 * Emitted signals:
 *   high_refund_rate          — customer's historical refund rate is elevated
 *   late_claim                — claim filed outside the policy reporting window
 *   high_value_item           — item value exceeds high-value threshold
 *   repeat_claimant           — customer has filed multiple recent claims
 *   delivered_but_claimed_missing — logistics says delivered; claim says not received
 *   no_video_proof            — high-value item without video evidence
 */

import type { Agent } from "../index";
import type { ArtifactAnalysis } from "../../types/artifact";
import type { NormalizedSignal } from "../../types/signal";
import { signal, EXTRACTOR } from "./shared";

/** Structured order and customer context passed to the MetadataEvidenceAgent. */
export type OrderMetadata = {
  /** Customer's historical refund rate 0–1 */
  refundRate?: number;
  /** Hours between incident and claim submission */
  claimAgeHours?: number;
  /** Item retail value in USD (used for high-value threshold) */
  itemValueUsd?: number;
  /** Whether the merchant flagged this as a high-value order */
  highValue?: boolean;
  /** Whether video evidence was submitted alongside image */
  hasVideoProof?: boolean;
  /** Last known carrier delivery status */
  deliveryStatus?: string;
  /** What is being claimed */
  claimType?: string;
  /** Number of claims this customer filed in the last 30 days */
  previousClaimsLast30Days?: number;
  /** Customer account age in days (new accounts are higher risk) */
  accountAgeDays?: number;
};

export type MetadataEvidenceInput = {
  artifactId: string;
  metadata: OrderMetadata;
  /** Configurable thresholds — use defaults if omitted */
  thresholds?: MetadataThresholds;
};

export type MetadataThresholds = {
  /** Refund rate above which the signal fires (default 0.40) */
  highRefundRate?: number;
  /** Hours after which a claim is considered late (default 48) */
  lateFilingHours?: number;
  /** Item value in USD above which the high-value signal fires (default 200) */
  highValueUsd?: number;
  /** Number of claims in 30 days above which repeat_claimant fires (default 3) */
  repeatClaimCount?: number;
};

export type MetadataEvidenceOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

const DEFAULT_THRESHOLDS: Required<MetadataThresholds> = {
  highRefundRate:   0.40,
  lateFilingHours:  48,
  highValueUsd:     200,
  repeatClaimCount: 3,
};

export class MetadataEvidenceAgent
  implements Agent<MetadataEvidenceInput, MetadataEvidenceOutput>
{
  readonly agentId = "metadata-evidence-agent";
  readonly version = "1.0.0";

  async run(input: MetadataEvidenceInput): Promise<MetadataEvidenceOutput> {
    const { artifactId, metadata, thresholds = {} } = input;
    const cfg   = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const start = Date.now();

    const signals: NormalizedSignal[] = [
      this.highRefundRateSignal(artifactId, metadata, cfg),
      this.lateClaimSignal(artifactId, metadata, cfg),
      this.highValueSignal(artifactId, metadata, cfg),
      ...this.repeatClaimantSignal(artifactId, metadata, cfg),
      this.deliveredButMissingSignal(artifactId, metadata),
      this.noVideoProofSignal(artifactId, metadata),
    ].flat();

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId:     this.agentId,
      modelId:     "rule-engine@1.0",
      provider:    undefined,
      rawScore:    undefined,
      notes:       ["metadata-evidence-agent: deterministic rule analysis — no external calls."],
      durationMs:  Date.now() - start,
      completedAt: new Date(),
    };

    return { analysis, signals };
  }

  // ── Signal builders ─────────────────────────────────────────────────────────

  private highRefundRateSignal(
    artifactId: string,
    m: OrderMetadata,
    cfg: Required<MetadataThresholds>,
  ): NormalizedSignal {
    if (m.refundRate === undefined) {
      return signal({
        key: "high_refund_rate",
        value: "Refund rate unavailable",
        flag: "neutral", weight: "medium", confidence: 0.4,
        artifactId, modality: "metadata", extractor: EXTRACTOR.metadata,
        rationale: "Refund rate was not provided for this customer.",
      });
    }

    const isHigh = m.refundRate >= cfg.highRefundRate;
    const pct    = Math.round(m.refundRate * 100);

    return signal({
      key:        "high_refund_rate",
      value:      `Customer refund rate: ${pct}%`,
      flag:       isHigh ? "risk" : m.refundRate >= 0.2 ? "neutral" : "clean",
      weight:     isHigh ? "high" : "low",
      rawScore:   m.refundRate,
      confidence: 0.9, // deterministic rule — high confidence
      artifactId,
      modality:   "metadata",
      extractor:  EXTRACTOR.metadata,
      rationale:  isHigh
        ? `Refund rate ${pct}% exceeds threshold of ${Math.round(cfg.highRefundRate * 100)}% — elevated fraud risk.`
        : `Refund rate ${pct}% is within acceptable range.`,
    });
  }

  private lateClaimSignal(
    artifactId: string,
    m: OrderMetadata,
    cfg: Required<MetadataThresholds>,
  ): NormalizedSignal {
    if (m.claimAgeHours === undefined) {
      return signal({
        key: "late_claim",
        value: "Claim submission time unavailable",
        flag: "neutral", weight: "low", confidence: 0.4,
        artifactId, modality: "metadata", extractor: EXTRACTOR.metadata,
        rationale: "Claim age was not provided.",
      });
    }

    const isLate = m.claimAgeHours > cfg.lateFilingHours;

    return signal({
      key:        "late_claim",
      value:      `Claim filed ${m.claimAgeHours}h after incident`,
      flag:       isLate ? "risk" : "clean",
      weight:     isLate ? "medium" : "low",
      rawScore:   m.claimAgeHours,
      confidence: 0.95,
      artifactId,
      modality:   "metadata",
      extractor:  EXTRACTOR.metadata,
      rationale:  isLate
        ? `Claim filed ${m.claimAgeHours}h after incident — policy requires reporting within ${cfg.lateFilingHours}h.`
        : `Claim filed within policy window (${m.claimAgeHours}h ≤ ${cfg.lateFilingHours}h threshold).`,
    });
  }

  private highValueSignal(
    artifactId: string,
    m: OrderMetadata,
    cfg: Required<MetadataThresholds>,
  ): NormalizedSignal {
    const isHighValue = m.highValue === true ||
      (m.itemValueUsd !== undefined && m.itemValueUsd >= cfg.highValueUsd);

    if (m.highValue === undefined && m.itemValueUsd === undefined) {
      return signal({
        key: "high_value_item",
        value: "Item value unknown",
        flag: "neutral", weight: "low", confidence: 0.3,
        artifactId, modality: "metadata", extractor: EXTRACTOR.metadata,
        rationale: "No item value data provided.",
      });
    }

    const valueStr = m.itemValueUsd ? `$${m.itemValueUsd.toFixed(2)}` : "flagged as high-value";

    return signal({
      key:        "high_value_item",
      value:      isHighValue ? `High-value item (${valueStr})` : `Standard-value item (${valueStr})`,
      flag:       isHighValue ? "neutral" : "clean",
      weight:     isHighValue ? "medium" : "low",
      rawScore:   m.itemValueUsd,
      confidence: m.itemValueUsd !== undefined ? 0.95 : 0.7,
      artifactId,
      modality:   "metadata",
      extractor:  EXTRACTOR.metadata,
      rationale:  isHighValue
        ? `Item is high-value — stricter evidence requirements apply.`
        : `Item value does not trigger high-value policy rules.`,
    });
  }

  private repeatClaimantSignal(
    artifactId: string,
    m: OrderMetadata,
    cfg: Required<MetadataThresholds>,
  ): NormalizedSignal[] {
    const signals: NormalizedSignal[] = [];

    if (m.previousClaimsLast30Days !== undefined) {
      const isRepeat = m.previousClaimsLast30Days >= cfg.repeatClaimCount;
      signals.push(signal({
        key:        "repeat_claimant",
        value:      `${m.previousClaimsLast30Days} claim${m.previousClaimsLast30Days !== 1 ? "s" : ""} in last 30 days`,
        flag:       isRepeat ? "risk" : m.previousClaimsLast30Days >= 2 ? "neutral" : "clean",
        weight:     isRepeat ? "high" : "low",
        rawScore:   m.previousClaimsLast30Days,
        confidence: 0.9,
        artifactId,
        modality:   "metadata",
        extractor:  EXTRACTOR.metadata,
        rationale:  isRepeat
          ? `${m.previousClaimsLast30Days} claims in 30 days ≥ threshold of ${cfg.repeatClaimCount} — possible repeat fraud.`
          : `Claim frequency is within acceptable range.`,
      }));
    }

    if (m.accountAgeDays !== undefined && m.accountAgeDays < 30) {
      signals.push(signal({
        key:        "new_account",
        value:      `Account created ${m.accountAgeDays} day${m.accountAgeDays !== 1 ? "s" : ""} ago`,
        flag:       m.accountAgeDays < 7 ? "risk" : "neutral",
        weight:     "medium",
        rawScore:   m.accountAgeDays,
        confidence: 0.95,
        artifactId,
        modality:   "metadata",
        extractor:  EXTRACTOR.metadata,
        rationale:  `Very new account (${m.accountAgeDays}d old) submitting a claim — elevated risk for first-party fraud.`,
      }));
    }

    return signals;
  }

  private deliveredButMissingSignal(
    artifactId: string,
    m: OrderMetadata,
  ): NormalizedSignal {
    const conflict =
      m.deliveryStatus === "delivered_intact" &&
      m.claimType === "not_received";

    if (!m.deliveryStatus || !m.claimType) {
      return signal({
        key: "delivered_but_claimed_missing",
        value: "Delivery vs claim check: insufficient data",
        flag: "neutral", weight: "medium", confidence: 0.3,
        artifactId, modality: "metadata", extractor: EXTRACTOR.metadata,
        rationale: "Delivery status or claim type not provided — cannot cross-check.",
      });
    }

    return signal({
      key:        "delivered_but_claimed_missing",
      value:      conflict
        ? "Carrier confirms delivery; customer claims non-receipt"
        : "Delivery status and claim type are consistent",
      flag:       conflict ? "risk" : "clean",
      weight:     "high",
      confidence: conflict ? 0.9 : 0.85,
      artifactId,
      modality:   "metadata",
      extractor:  EXTRACTOR.metadata,
      rationale:  conflict
        ? `Carrier marked order as ${m.deliveryStatus} but claim type is ${m.claimType} — direct contradiction.`
        : `Delivery status (${m.deliveryStatus}) is consistent with claim type (${m.claimType}).`,
    });
  }

  private noVideoProofSignal(
    artifactId: string,
    m: OrderMetadata,
  ): NormalizedSignal {
    const isHighValue = m.highValue === true;

    if (!isHighValue) {
      return signal({
        key: "no_video_proof",
        value: "Video proof not required (standard-value item)",
        flag: "clean", weight: "low", confidence: 0.8,
        artifactId, modality: "metadata", extractor: EXTRACTOR.metadata,
        rationale: "Video evidence policy only applies to high-value items.",
      });
    }

    const missing = !m.hasVideoProof;
    return signal({
      key:        "no_video_proof",
      value:      missing ? "High-value item — no video proof submitted" : "Video proof provided",
      /** Risk when required video is missing so policy rules can escalate consistently */
      flag:       missing ? "risk" : "clean",
      weight:     missing ? "medium" : "low",
      confidence: 0.9,
      artifactId,
      modality:   "metadata",
      extractor:  EXTRACTOR.metadata,
      rationale:  missing
        ? "Policy requires video evidence for high-value item claims. Only photo evidence submitted."
        : "Video proof was submitted — satisfies high-value evidence requirement.",
    });
  }
}

export const metadataEvidenceAgent = new MetadataEvidenceAgent();
