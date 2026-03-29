/**
 * Signal fusion types
 *
 * FusedSignal extends NormalizedSignal with cross-modal provenance metadata.
 * SignalFusionResult is the output of the SignalFusionAgent.
 */

import type { ArtifactModality } from "./artifact";
import type { NormalizedSignal } from "./signal";

/**
 * A NormalizedSignal enriched with cross-modal corroboration data.
 * Confidence may have been reinforced when independent modalities agree.
 */
export type FusedSignal = NormalizedSignal & {
  /** How many source signals (across all modalities) were merged into this one */
  fusedFromCount: number;
  /** True if confidence was boosted by independent cross-modal agreement */
  reinforced: boolean;
  /** Keys of signals from OTHER modalities that agree with this signal's flag */
  corroboratedBy: string[];
  /** Keys of signals from OTHER modalities that contradict this signal's flag */
  contradictedBy: string[];
};

/** Two signals whose flags directly oppose each other across modalities */
export type ContradictionReport = {
  signalA: string;          // key of first signal
  signalB: string;          // key of second signal
  modalityA: ArtifactModality;
  modalityB: ArtifactModality;
  severity: "strong" | "weak";
  description: string;
};

/** Overall strength of the submitted evidence bundle */
export type EvidenceStrength = "strong" | "moderate" | "weak" | "insufficient";

/** Full output of the SignalFusionAgent */
export type SignalFusionResult = {
  /** Enriched signals — same keys as input, confidence may be updated */
  fusedSignals: FusedSignal[];

  /** Cross-modal contradiction pairs detected */
  contradictions: ContradictionReport[];

  /** How strong the overall evidence bundle is */
  evidenceStrength: EvidenceStrength;

  /**
   * 0–1: how consistent claim evidence is across modalities.
   * 1 = all signals tell the same story; 0 = severe contradictions.
   */
  claimEvidenceConsistency: number;

  /** Which modalities contributed at least one signal */
  modalitiesCovered: ArtifactModality[];
};
