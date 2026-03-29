/**
 * Outcome feedback — human overrides, merchant resolution, chargeback/dispute results.
 *
 * Wire sinks to Prisma, webhooks, or analytics. Keeps improvement loops explicit:
 * calibration and policy changes are driven by recorded outcomes, not silent drift.
 */

import type { DecisionOutcome } from "../types/policy";

/** Source of the feedback row */
export type OutcomeFeedbackKind =
  | "human_override"
  | "merchant_resolution"
  | "chargeback"
  | "dispute"
  | "eval_replay"
  | "notes";

export type OutcomeFeedbackPayload = {
  kind: OutcomeFeedbackKind;
  caseId: string;
  /** Decision run this feedback refers to (if any) */
  decisionRunId?: string;
  /** Automated policy outcome before human/merchant action */
  pipelineOutcome?: DecisionOutcome;
  /** Final business outcome label (refund granted, denied, partial, etc.) */
  finalOutcome?: string;
  /** Merchant or reviewer id */
  recordedBy?: string;
  notes?: string;
  /** Chargeback / dispute: true = won (merchant), false = lost */
  chargebackWon?: boolean;
  amountUsd?: number;
  /** Arbitrary structured fields (reason codes, PSP ids, eval fixture id, …) */
  metadata?: Record<string, unknown>;
};

export type OutcomeFeedbackSink = (payload: OutcomeFeedbackPayload) => void | Promise<void>;

const sinks: OutcomeFeedbackSink[] = [];

/** Register a listener (DB writer, queue, webhook). Idempotent per process. */
export function registerOutcomeFeedbackSink(sink: OutcomeFeedbackSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i !== -1) sinks.splice(i, 1);
  };
}

/** Emit feedback to all registered sinks (errors in one sink do not block others). */
export async function emitOutcomeFeedback(
  payload: OutcomeFeedbackPayload,
): Promise<void> {
  await Promise.all(
    sinks.map(async (sink) => {
      try {
        await sink(payload);
      } catch {
        // Swallow — feedback must not break primary flows; log in real sink impl
      }
    }),
  );
}

/**
 * Convenience: record human override vs pipeline (for calibration dashboards).
 */
export async function recordHumanOverride(input: {
  caseId: string;
  decisionRunId?: string;
  pipelineOutcome: DecisionOutcome;
  reviewerDecision: DecisionOutcome | string;
  reviewerId: string;
  notes?: string;
}): Promise<void> {
  await emitOutcomeFeedback({
    kind:             "human_override",
    caseId:           input.caseId,
    decisionRunId:    input.decisionRunId,
    pipelineOutcome:  input.pipelineOutcome,
    finalOutcome:     String(input.reviewerDecision),
    recordedBy:       input.reviewerId,
    notes:            input.notes,
  });
}

/**
 * Record chargeback or payment dispute resolution when known (weeks later).
 */
export async function recordChargebackOrDisputeOutcome(input: {
  caseId: string;
  decisionRunId?: string;
  won: boolean;
  amountUsd?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  /** Default "chargeback"; use "dispute" for payment-processor disputes */
  kind?: "chargeback" | "dispute";
}): Promise<void> {
  const kind = input.kind ?? "chargeback";
  await emitOutcomeFeedback({
    kind,
    caseId:        input.caseId,
    decisionRunId: input.decisionRunId,
    chargebackWon: input.won,
    amountUsd:     input.amountUsd,
    notes:         input.notes,
    metadata:      input.metadata,
    finalOutcome:  input.won ? `${kind}_won` : `${kind}_lost`,
  });
}
