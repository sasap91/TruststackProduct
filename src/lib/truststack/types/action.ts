/**
 * ActionExecution — a bounded action taken (or deferred) after a PolicyDecision.
 *
 * Actions are the only way TrustStack mutates external systems.
 * Every execution is recorded with full context for auditability.
 */

export type ActionType =
  // Resolution actions
  | "auto_approve"              // legacy alias
  | "auto_refund"               // issue refund via payment integration
  | "auto_reject"               // close case with rejection
  // Review routing
  | "send_to_human_review"      // queue case for a human agent
  | "escalate_to_review"        // legacy alias
  // Evidence actions
  | "request_more_evidence"     // prompt claimant for additional proof
  | "generate_evidence_pack"    // compile signals + artifacts into a reviewable pack
  // Fraud actions
  | "block_and_flag"            // flag account for fraud review + block further claims
  // System
  | "send_notification"
  | "trigger_webhook"
  | "update_case_status"
  | "no_action";

export type ActionStatus =
  | "pending"
  | "executing"
  | "completed"
  | "failed"
  | "skipped";

export type ActionExecution = {
  id: string;
  caseId: string;

  /** What this action does */
  action: ActionType;

  /** Current execution state */
  status: ActionStatus;

  /**
   * Which external system this action targets.
   * e.g. "zendesk", "shopify", "email", "webhook", "internal"
   */
  targetSystem?: string;

  /** Payload sent to the target system (sanitized for logging) */
  payload?: unknown;

  /** Response received from the target system */
  response?: unknown;

  /** When action execution started */
  executedAt?: Date;

  /** When action execution completed (success or failure) */
  completedAt?: Date;

  /** Human-readable description for the audit log */
  auditMessage: string;

  /** Error message if status = "failed" */
  error?: string;
};
