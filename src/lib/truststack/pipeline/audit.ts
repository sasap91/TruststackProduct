/**
 * TrustStack pipeline — audit writer.
 *
 * Builds an immutable AuditRecord from the pipeline run and writes it to the
 * configured backend. Defaults to structured JSON on stdout (console.log).
 *
 * To plug in a persistent backend (database, S3, etc.) pass a custom writer
 * to writeAuditRecord() or replace the defaultAuditWriter export.
 */

import type { PipelineClaimInput, ClassifierOutput } from "../types/claim";
import type { VisualSignals, TextSignals, ConsistencySignals } from "../types/signals";
import type { AuditRecord, PipelineDecision } from "../types/decision";

// ── Writer interface ──────────────────────────────────────────────────────────

export type AuditWriter = (record: AuditRecord) => Promise<void>;

export const defaultAuditWriter: AuditWriter = async (record) => {
  console.log(JSON.stringify({ truststack_audit: record }));
};

// ── Record builder ────────────────────────────────────────────────────────────

export function buildAuditRecord(opts: {
  input:               PipelineClaimInput;
  classifierOutput:    ClassifierOutput;
  visualSignals:       VisualSignals;
  textSignals:         TextSignals;
  consistencySignals:  ConsistencySignals;
  decision:            PipelineDecision;
  pipelineDurationMs:  number;
}): AuditRecord {
  return {
    claimId:            opts.input.claimId,
    input:              opts.input,
    classifierOutput:   opts.classifierOutput,
    visualSignals:      opts.visualSignals,
    textSignals:        opts.textSignals,
    consistencySignals: opts.consistencySignals,
    decision:           opts.decision,
    pipelineDurationMs: opts.pipelineDurationMs,
    modelVersions: {
      classifier:  "claude-haiku-4-5-20251001",
      visual:      opts.visualSignals.skipped ? null : "claude-opus-4-6",
      text:        "claude-haiku-4-5-20251001",
      consistency: "claude-sonnet-4-6",
    },
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function writeAuditRecord(
  record: AuditRecord,
  writer: AuditWriter = defaultAuditWriter,
): Promise<void> {
  await writer(record);
}
