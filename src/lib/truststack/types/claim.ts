/**
 * TrustStack deterministic pipeline — claim input types.
 *
 * These types are scoped to the pipeline package (src/lib/truststack/pipeline/).
 * They are intentionally separate from the existing orchestrator types in
 * this directory (case.ts, policy.ts, etc.) and are NOT re-exported from
 * the barrel index.ts.
 */

/**
 * The 8 claim types the pipeline classifier can identify.
 *
 * never_arrived and chargeback skip visual extraction — no photos expected.
 */
export enum PipelineClaimType {
  low_quality_product = "low_quality_product",
  counterfeit_product = "counterfeit_product",
  never_arrived       = "never_arrived",
  wrong_item          = "wrong_item",
  damaged_in_transit  = "damaged_in_transit",
  warranty_dispute    = "warranty_dispute",
  chargeback          = "chargeback",
  marketplace_seller  = "marketplace_seller",
}

/** Raw input submitted to the pipeline entry point. */
export interface PipelineClaimInput {
  claimId: string;
  retailerId: string;
  customerId: string;
  /** ISO 8601 date string */
  orderDate: string;
  /** ISO 8601 date string */
  claimDate: string;
  /** Order value in minor currency units (e.g. cents) */
  orderValue: number;
  /** ISO 4217 currency code */
  currency: string;
  productTitle: string;
  productSku: string;
  claimDescription: string;
  /** URLs of supporting evidence documents (receipts, correspondence, etc.) */
  evidenceUrls: string[];
  /** URLs of submitted photos — may be empty */
  photoUrls: string[];
  /**
   * Optional caller-declared claim type. When present, ELIG_004 checks
   * this against the classifier's output.
   */
  declaredClaimType?: PipelineClaimType;
  /** Arbitrary retailer-supplied metadata passed through to the audit record */
  metadata: Record<string, string>;
}

/** Output of LLM step 1: classify_claim() */
export interface ClassifierOutput {
  claimType: PipelineClaimType;
  /** 0.0 – 1.0 */
  confidence: number;
  /** One-sentence justification from the model */
  reasoning: string;
}
