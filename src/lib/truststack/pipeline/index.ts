/**
 * TrustStack deterministic pipeline — orchestrator.
 *
 * Execution order (fixed — never reorder, never merge steps):
 *
 *   Step 1 — classify_claim()          [Haiku]    always
 *   Step 2 — extract_visual()          [Opus]     skip if never_arrived | chargeback | no photos
 *   Step 3 — extract_text()            [Haiku]    always
 *            Steps 2 & 3 run in parallel via Promise.all()
 *   Step 4 — check_consistency()       [Sonnet]   always
 *   ─── signal merge ───────────────────────────────────────────────
 *   Policy engine (pure TypeScript — no LLM)
 *   Audit record written
 *
 * Returns PipelineDecision.
 */

import type { PipelineClaimInput } from "../types/claim";
import type { PipelineDecision } from "../types/decision";

import { classify_claim }    from "./classifier";
import { extract_visual }    from "./visual";
import { extract_text }      from "./text";
import { check_consistency } from "./consistency";
import { parseDocuments }    from "./doc-parser";
import { mergeSignals }      from "./signal-merge";
import { runPolicyEngine }   from "./policy-engine";
import { buildAuditRecord, writeAuditRecord } from "./audit";
import type { AuditWriter }  from "./audit";
import { getRetailerRules }  from "../rules/retailer-rules";

// ── Options ───────────────────────────────────────────────────────────────────

export interface RunPipelineOptions {
  /**
   * Override the audit writer (e.g. in tests, or to wire a DB backend).
   * Defaults to the console JSON writer.
   */
  auditWriter?: AuditWriter;
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

export async function runPipeline(
  input: PipelineClaimInput,
  opts:  RunPipelineOptions = {},
): Promise<PipelineDecision> {
  const startMs = Date.now();

  // ── Step 1: Classify ────────────────────────────────────────────────────────
  const classifierOutput = await classify_claim(input);

  // ── Steps 2 & 3: Visual + Text (parallel) ──────────────────────────────────
  const documents = parseDocuments(input.evidenceUrls);

  const [visualSignals, textSignals] = await Promise.all([
    extract_visual(input, classifierOutput),
    extract_text(input, classifierOutput, documents),
  ]);

  // ── Step 4: Consistency ─────────────────────────────────────────────────────
  const consistencySignals = await check_consistency(
    input,
    classifierOutput,
    visualSignals,
    textSignals,
  );

  // ── Signal merge ────────────────────────────────────────────────────────────
  const signals = mergeSignals(classifierOutput, visualSignals, textSignals, consistencySignals);

  // ── Policy engine (pure TypeScript — no LLM) ────────────────────────────────
  const retailerRules = getRetailerRules(input.retailerId);
  const decision = runPolicyEngine(input, signals, retailerRules);

  // ── Audit ───────────────────────────────────────────────────────────────────
  const auditRecord = buildAuditRecord({
    input,
    classifierOutput,
    visualSignals,
    textSignals,
    consistencySignals,
    decision,
    pipelineDurationMs: Date.now() - startMs,
  });

  await writeAuditRecord(auditRecord, opts.auditWriter);

  return decision;
}

// Re-export key types so callers only need one import path.
export type { PipelineClaimInput } from "../types/claim";
export type { PipelineDecision }   from "../types/decision";
export { PipelineClaimType }       from "../types/claim";
