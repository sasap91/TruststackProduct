/**
 * VelocityEvidenceAgent
 *
 * Queries the database for historical claim counts across userId, shippingAddress,
 * and email, then emits risk signals when counts exceed abuse thresholds.
 *
 * This is the only evidence agent with a DB dependency — by design, since
 * velocity is a cross-claim behavioral signal that cannot be derived from
 * the current claim's evidence artifacts alone.
 *
 * Emitted signals:
 *   very_high_claim_velocity  — ≥6 claims/30d by same user          weight:high
 *   high_claim_velocity       — ≥3 claims/30d by same user          weight:medium
 *   shared_address_abuse      — ≥3 claims/30d from same address     weight:medium
 *   email_velocity_abuse      — ≥3 claims/30d from same email       weight:medium
 */

import type { Agent } from "../index";
import type { ArtifactAnalysis, ArtifactModality } from "../../types/artifact";
import type { NormalizedSignal } from "../../types/signal";
import { signal, EXTRACTOR } from "./shared";
import { getVelocitySignals } from "@/lib/truststack-repo";

export type VelocityEvidenceInput = {
  /** Synthetic artifact ID, e.g. `${caseId}-velocity` */
  artifactId:      string;
  /** Current case ID — excluded from velocity counts to avoid self-counting */
  caseId:          string;
  userId:          string;
  shippingAddress?: string;
  email?:           string;
};

export type VelocityEvidenceOutput = {
  analysis: ArtifactAnalysis;
  signals:  NormalizedSignal[];
};

const MODALITY: ArtifactModality = "metadata";

export class VelocityEvidenceAgent implements Agent<VelocityEvidenceInput, VelocityEvidenceOutput> {
  readonly agentId = "velocity-evidence-agent";
  readonly version = "1.0.0";

  async run(input: VelocityEvidenceInput): Promise<VelocityEvidenceOutput> {
    const start = Date.now();

    const velocityData = await getVelocitySignals(input.caseId, input.userId, {
      shippingAddress: input.shippingAddress,
      email:           input.email,
    });

    const signals: NormalizedSignal[] = [];
    const { claimsLast30DaysByUser: byUser, claimsLast30DaysByAddress: byAddr, claimsLast30DaysByEmail: byEmail } = velocityData;

    // ── User velocity — emit only the highest applicable signal ──────────────
    if (byUser >= 6) {
      signals.push(signal({
        key:        "very_high_claim_velocity",
        value:      `${byUser} claims in the last 30 days (same account)`,
        flag:       "risk",
        weight:     "high",
        confidence: Math.min(1, 0.6 + (byUser - 6) * 0.05),
        rationale:  `User filed ${byUser} claims in the past 30 days — consistent with systematic abuse`,
        artifactId: input.artifactId,
        modality:   MODALITY,
        extractor:  EXTRACTOR.velocity,
      }));
    } else if (byUser >= 3) {
      signals.push(signal({
        key:        "high_claim_velocity",
        value:      `${byUser} claims in the last 30 days (same account)`,
        flag:       "risk",
        weight:     "medium",
        confidence: Math.min(1, 0.5 + (byUser - 3) * 0.05),
        rationale:  `User filed ${byUser} claims in the past 30 days — elevated claim frequency`,
        artifactId: input.artifactId,
        modality:   MODALITY,
        extractor:  EXTRACTOR.velocity,
      }));
    }

    // ── Address velocity ──────────────────────────────────────────────────────
    if (byAddr !== null && byAddr >= 3) {
      signals.push(signal({
        key:        "shared_address_abuse",
        value:      `${byAddr} claims from the same shipping address in the last 30 days`,
        flag:       "risk",
        weight:     "medium",
        confidence: Math.min(1, 0.55 + (byAddr - 3) * 0.05),
        rationale:  `${byAddr} claims originating from the same shipping address — possible coordinated fraud`,
        artifactId: input.artifactId,
        modality:   MODALITY,
        extractor:  EXTRACTOR.velocity,
      }));
    }

    // ── Email velocity ────────────────────────────────────────────────────────
    if (byEmail !== null && byEmail >= 3) {
      signals.push(signal({
        key:        "email_velocity_abuse",
        value:      `${byEmail} claims from the same email address in the last 30 days`,
        flag:       "risk",
        weight:     "medium",
        confidence: Math.min(1, 0.55 + (byEmail - 3) * 0.05),
        rationale:  `${byEmail} claims linked to the same email — possible multi-account abuse`,
        artifactId: input.artifactId,
        modality:   MODALITY,
        extractor:  EXTRACTOR.velocity,
      }));
    }

    const notes: string[] = [
      `byUser=${byUser}`,
      ...(byAddr !== null ? [`byAddress=${byAddr}`] : []),
      ...(byEmail !== null ? [`byEmail=${byEmail}`] : []),
    ];

    const analysis: ArtifactAnalysis = {
      artifactId:  input.artifactId,
      agentId:     this.agentId,
      modelId:     "db-velocity-query@1.0",
      provider:    undefined,
      rawScore:    undefined,
      notes,
      durationMs:  Date.now() - start,
      completedAt: new Date(),
    };

    return { analysis, signals };
  }
}

export const velocityEvidenceAgent = new VelocityEvidenceAgent();
