/**
 * orchestrator-loop.ts
 *
 * Iterative evidence-gathering wrapper around MultimodalClaimOrchestrator.
 *
 * ── Loop contract ─────────────────────────────────────────────────────────────
 *
 *   Iterations 1–3 (MAX_ITERATIONS):
 *     Run the full pipeline. If outcome is "request_more_evidence" AND the
 *     case is still within the evidence collection window (policy.evidenceTimeoutHours,
 *     default 72h): return shouldAwaitEvidence=true so the caller can set the
 *     case to AWAITING_EVIDENCE and wait for re-submission.
 *
 *   Evidence timeout exceeded:
 *     If the case is older than evidenceTimeoutHours and outcome is
 *     "request_more_evidence", override to "reject" — do not keep waiting.
 *
 *   Iteration > MAX_ITERATIONS (4th+ attempt):
 *     Force-escalate to human review regardless of the pipeline outcome.
 *     This is the hard cap: after 3 evidence cycles the case must be resolved
 *     by a human, not another automated request.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────────
 *   - No DB reads or writes — callers own persistence.
 *   - No status transitions — the route layer sets AWAITING_EVIDENCE / ANALYZING.
 *   - No webhook dispatches — the route layer does those.
 *
 * ── Return value ──────────────────────────────────────────────────────────────
 *
 *   shouldAwaitEvidence  true when the case should be held for more evidence.
 *                        Caller should:
 *                          1. Persist the run (with iterationNumber)
 *                          2. Execute ONLY the request_more_evidence action
 *                          3. Set case.status = AWAITING_EVIDENCE
 *
 *   forcedEscalation     true when we hit the iteration cap and the outcome
 *                        was overridden to "review".
 *
 *   timedOut             true when the evidence window expired and the outcome
 *                        was overridden to "reject".
 */

import type { ClaimCase }    from "./types/case";
import type { PolicyConfig } from "./types/policy";
import type { DecisionRun }  from "./types/run";
import { claimOrchestrator } from "./orchestrator";

export const MAX_ITERATIONS = 3;
const DEFAULT_TIMEOUT_HOURS = 72;

export type PreviousDecision = {
  outcome:     string;
  explanation: string;
  iteration:   number;
};

export type LoopInput = {
  claimCase:        ClaimCase;
  policyConfig?:    PolicyConfig;
  triggeredBy:      string;
  /** Which pass this is (1 = first, 2+ = after evidence re-submission). */
  iterationNumber:  number;
  /** Timestamp of when the case was first created — used for timeout check. */
  caseCreatedAt:    Date;
  /** Summary of the previous run, for JudgeAgent context. Present on iteration 2+. */
  previousDecision?: PreviousDecision;
  mediaBuffers?:    Map<string, ArrayBuffer>;
};

export type LoopResult = {
  run:                 DecisionRun;
  iterationNumber:     number;
  /** True → caller should set case to AWAITING_EVIDENCE and execute only the evidence request action. */
  shouldAwaitEvidence: boolean;
  /** True → iteration cap was reached; outcome overridden to "review". */
  forcedEscalation:    boolean;
  /** True → evidence timeout expired; outcome overridden to "reject". */
  timedOut:            boolean;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the pipeline for one iteration, applying loop policy:
 *   - Force escalation when iterationNumber > MAX_ITERATIONS
 *   - Timeout rejection when evidence window has expired
 *   - Normal await when outcome is "request_more_evidence" within limits
 */
export async function runWithLoop(input: LoopInput): Promise<LoopResult> {
  const {
    claimCase,
    policyConfig = {},
    triggeredBy,
    iterationNumber,
    caseCreatedAt,
    previousDecision,
    mediaBuffers,
  } = input;

  // Run the pipeline
  const { run } = await claimOrchestrator.run({
    claimCase,
    mediaBuffers,
    policyConfig,
    triggeredBy,
    iterationNumber,
    previousDecision,
  });

  const outcome = run.policyDecision?.outcome;

  // ── Forced escalation (hard cap) ─────────────────────────────────────────
  if (iterationNumber > MAX_ITERATIONS && outcome === "request_more_evidence") {
    run.policyDecision!.outcome = "review";
    run.justification = (run.justification ?? "")
      ? `[Iteration cap reached after ${iterationNumber} passes — escalated to human review] ${run.justification}`
      : `Claim escalated to human review after ${iterationNumber} evidence-gathering cycles without a deterministic resolution.`;
    return { run, iterationNumber, shouldAwaitEvidence: false, forcedEscalation: true, timedOut: false };
  }

  // ── Request more evidence: check timeout ─────────────────────────────────
  if (outcome === "request_more_evidence") {
    const timeoutHours = policyConfig.evidenceTimeoutHours ?? DEFAULT_TIMEOUT_HOURS;
    const caseAgeHours = (Date.now() - caseCreatedAt.getTime()) / 3_600_000;

    if (caseAgeHours > timeoutHours) {
      // Evidence window expired — auto-reject instead of waiting
      run.policyDecision!.outcome = "reject";
      run.justification = (run.justification ?? "")
        ? `[Evidence window expired after ${Math.round(caseAgeHours)}h / limit ${timeoutHours}h] ${run.justification}`
        : `Evidence collection window of ${timeoutHours}h has elapsed. The claim has been automatically rejected due to insufficient evidence submission.`;
      return { run, iterationNumber, shouldAwaitEvidence: false, forcedEscalation: false, timedOut: true };
    }

    // Within window — wait for more evidence
    return { run, iterationNumber, shouldAwaitEvidence: true, forcedEscalation: false, timedOut: false };
  }

  // ── Normal outcome (approve / reject / review / flag) ────────────────────
  return { run, iterationNumber, shouldAwaitEvidence: false, forcedEscalation: false, timedOut: false };
}
