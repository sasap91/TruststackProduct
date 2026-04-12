/**
 * TrustStack deterministic pipeline — retailer rule overrides.
 *
 * getRetailerRules(retailerId) returns the effective RetailerRuleSet for a
 * given retailer. Unknown retailer IDs fall back to DEFAULT_RETAILER_RULES.
 *
 * To register a retailer, add an entry to RETAILER_CONFIGS below.
 * Never modify DEFAULT_RETAILER_RULES directly — override only the fields
 * that differ from the default.
 */

import type { RetailerRuleSet } from "../types/decision";

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_RETAILER_RULES: Readonly<RetailerRuleSet> = {
  retailerId:                     "default",
  returnWindowDays:               30,
  maxClaimValueMinorUnits:        50_000,
  policyValueThresholdMinorUnits: 20_000,
  disabledRules:                  [],
};

// ── Per-retailer overrides ────────────────────────────────────────────────────

/**
 * Map of retailer ID → partial overrides.
 * Missing keys fall back to DEFAULT_RETAILER_RULES.
 */
const RETAILER_CONFIGS: Record<string, Partial<Omit<RetailerRuleSet, "retailerId">>> = {
  // Example: lenient retailer with 60-day window and higher value cap
  // "retailer-lenient": {
  //   returnWindowDays:        60,
  //   maxClaimValueMinorUnits: 200_000,
  // },

  // Example: strict retailer with 14-day window
  // "retailer-strict": {
  //   returnWindowDays: 14,
  // },
};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns the merged RetailerRuleSet for the given retailerId.
 * Always returns a complete object — never returns partial data.
 */
export function getRetailerRules(retailerId: string): RetailerRuleSet {
  const override = RETAILER_CONFIGS[retailerId] ?? {};
  return {
    ...DEFAULT_RETAILER_RULES,
    ...override,
    retailerId,
  };
}
