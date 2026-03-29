/**
 * ClaimCase — the primary unit of work in TrustStack.
 *
 * A case is created when a claim is submitted. It accumulates evidence
 * artifacts, undergoes one or more DecisionRuns, and transitions through
 * a defined lifecycle until it is resolved.
 *
 * Cases are never mutated in place — state changes are appended as events.
 */

import type { EvidenceArtifact } from "./artifact";
import type { DecisionRun } from "./run";

export type CaseStatus =
  | "OPEN"
  | "ANALYZING"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FLAGGED";

export type ClaimType =
  | "damaged_item"
  | "not_received"
  | "wrong_item"
  | "other"
  | string; // extensible for merchant-specific types

export type DeliveryStatus =
  | "delivered_intact"
  | "not_delivered"
  | "unknown"
  | string;

export type ClaimCase = {
  id: string;
  /** Human-readable reference displayed to agents and customers, e.g. "TS-2026-A3F9" */
  ref: string;
  userId: string;
  status: CaseStatus;

  // ── Claim context ──────────────────────────────────────────────────────────
  claimType?: ClaimType;
  deliveryStatus?: DeliveryStatus;
  /** Free-text description of the claim */
  description?: string;

  // ── Account signals (enrichment from the merchant's system) ───────────────
  /** Customer's historical refund rate 0–1 */
  refundRate?: number;
  /** Whether the item is considered high-value by merchant policy */
  highValue?: boolean;
  /** Hours elapsed between the incident and claim submission */
  claimAgeHours?: number;
  /** Whether video evidence was provided (in addition to image) */
  hasVideoProof?: boolean;
  /** Claims filed by this customer in the last 30 days (metadata / fraud signals) */
  previousClaimsLast30Days?: number;
  /** Customer account age in days */
  accountAgeDays?: number;
  /** Item retail value in USD when known */
  itemValueUsd?: number;
  /** Amount the customer claims in USD (cross-check vs invoice / receipt evidence) */
  claimedAmountUsd?: number;

  // ── Evidence and analysis ──────────────────────────────────────────────────
  evidence: EvidenceArtifact[];
  /** The most recent (or only) decision run for this case */
  latestRun?: DecisionRun;

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
};
