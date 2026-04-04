/**
 * action-executor.ts
 *
 * Executes ActionExecution records produced by the ActionAgent.
 * This is the only layer in TrustStack that has real-world side effects for
 * claim decisions (email sends, fraud flags, evidence packs).
 *
 * Design:
 *   - ActionAgent remains side-effect-free (its design contract is preserved)
 *   - This layer runs AFTER persistRunOutputs has written actions to the DB
 *   - Each action transitions: pending → executing → completed | failed
 *   - Actions execute sequentially to preserve audit log ordering
 *   - Per-action failures are isolated — one failure does not abort the rest
 *   - Caller should fire-and-forget (.catch(() => null))
 */

import { db } from "@/lib/db";
import type {
  ActionExecution,
  DecisionOutcome,
  RiskLevel,
  ArtifactModality,
  ContradictionReport,
  EvidenceStrength,
} from "@/lib/truststack";

import { autoRefundHandler }    from "./handlers/auto-refund-handler";
import { autoRejectHandler }    from "./handlers/auto-reject-handler";
import { humanReviewHandler }   from "./handlers/human-review-handler";
import { requestEvidenceHandler } from "./handlers/request-evidence-handler";
import { blockAndFlagHandler }  from "./handlers/block-and-flag-handler";
import { evidencePackHandler }  from "./handlers/evidence-pack-handler";

// ── Context ───────────────────────────────────────────────────────────────────

export type ActionExecutorContext = {
  caseRef:            string;
  claimDescription:   string;
  riskLevel:          RiskLevel;
  riskScore:          number;
  outcome:            DecisionOutcome;
  triggeredRules:     string[];
  evidenceReferences: string[];
  contradictions:     ContradictionReport[];
  evidenceStrength:   EvidenceStrength;
  modalitiesCovered:  ArtifactModality[];
  userId:             string;
  /** Direct email for the claimant — falls back to TRUSTSTACK_ADMIN_EMAIL */
  claimantEmail?:     string;
  merchantEmail?:     string;
  /** Direct email for the reviewer queue — falls back to TRUSTSTACK_REVIEWER_EMAIL */
  reviewerEmail?:     string;
  adminEmail?:        string;
  /** Shopify order ID — triggers an API refund via ShopifyConnection when set */
  shopifyOrderId?:    string;
  /** Claim value in USD — passed as refund amount; 0 = full order amount via Shopify API */
  claimValueUsd?:     number;
};

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Execute all actions for a completed decision run.
 *
 * @param caseId        DB case id (used for DB writes and event creation)
 * @param actions       ActionExecution[] from the in-memory DecisionRun
 * @param context       Contextual data for email templates and event payloads
 */
export async function executeActions(
  caseId:  string,
  actions: ActionExecution[],
  context: ActionExecutorContext,
): Promise<void> {
  for (const action of actions) {
    // Skip no-ops and unknown actions that have no side effects
    if (action.action === "no_action" || action.action === "update_case_status") {
      continue;
    }

    try {
      // Transition: pending → executing
      await db.actionExecution.updateMany({
        where: { caseId, action: action.action, status: "pending" },
        data:  { status: "executing" },
      });

      // Dispatch to the appropriate handler
      await dispatch(action.action, context, caseId);

      // Transition: executing → completed + audit event
      await db.actionExecution.updateMany({
        where: { caseId, action: action.action, status: "executing" },
        data:  { status: "completed" },
      });
      await db.caseEvent.create({
        data: {
          caseId,
          actor:   "system",
          type:    "action_executed",
          payload: { action: action.action, caseRef: context.caseRef },
        },
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Transition: executing → failed
      await db.actionExecution.updateMany({
        where: { caseId, action: action.action, status: "executing" },
        data:  {
          status: "failed",
          notes:  message.slice(0, 500),
        },
      }).catch(() => null); // don't let a DB write failure mask the original error log

      await db.caseEvent.create({
        data: {
          caseId,
          actor:   "system",
          type:    "action_failed",
          payload: { action: action.action, caseRef: context.caseRef, error: message.slice(0, 500) },
        },
      }).catch(() => null);

      console.error(`[TrustStack] Action "${action.action}" failed for case ${context.caseRef}:`, err);
      // Continue to next action — per-action failure isolation
    }
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function dispatch(
  action:  string,
  context: ActionExecutorContext,
  caseId:  string,
): Promise<void> {
  switch (action) {
    case "auto_refund":
    case "auto_approve":
      return autoRefundHandler(context);

    case "auto_reject":
      return autoRejectHandler(context);

    case "send_to_human_review":
    case "escalate_to_review":
      return humanReviewHandler(context);

    case "request_more_evidence":
      return requestEvidenceHandler(context);

    case "block_and_flag":
      return blockAndFlagHandler(context, caseId);

    case "generate_evidence_pack":
      return evidencePackHandler(context, caseId);

    default:
      // send_notification, trigger_webhook — log and skip
      console.warn(`[TrustStack] No executor registered for action "${action}" on case ${context.caseRef}`);
  }
}
