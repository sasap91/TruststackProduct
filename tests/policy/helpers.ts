/**
 * Shared test helpers for policy engine unit tests.
 * No network calls. Pure data builders.
 */

import type { PipelineClaimInput } from "@/lib/truststack/types/claim";
import { PipelineClaimType } from "@/lib/truststack/types/claim";
import type { MergedSignals, VisualSignals, TextSignals, ConsistencySignals } from "@/lib/truststack/types/signals";
import type { RetailerRuleSet } from "@/lib/truststack/types/decision";

// ── Input builder ─────────────────────────────────────────────────────────────

export function makeInput(overrides: Partial<PipelineClaimInput> = {}): PipelineClaimInput {
  return {
    claimId:          "test-claim-001",
    retailerId:       "retailer-default",
    customerId:       "customer-abc",
    orderDate:        "2026-03-01",
    claimDate:        "2026-03-08",   // 7 days — well within 30-day window
    orderValue:       5000,           // $50.00 in cents
    currency:         "USD",
    productTitle:     "Widget Pro",
    productSku:       "WP-001",
    claimDescription: "Item arrived with cracked casing.",
    evidenceUrls:     [],
    photoUrls:        ["https://cdn.example.com/photo.jpg"],
    metadata:         {},
    ...overrides,
  };
}

// ── Signal builders ───────────────────────────────────────────────────────────

export function makeVisual(overrides: Partial<VisualSignals> = {}): VisualSignals {
  return {
    skipped:                  false,
    aiGeneratedPhotoDetected: false,
    photoMatchesDescription:  true,
    damageVisible:            true,
    suspiciousElements:       [],
    rawAssessment:            "",
    ...overrides,
  };
}

export function makeText(overrides: Partial<TextSignals> = {}): TextSignals {
  return {
    claimsConsistentWithType:   true,
    timelineAnomaly:            false,
    highValueLanguage:          false,
    evidenceDocumentsPresent:   false,
    parsedDocuments:            [],
    redFlags:                   [],
    ...overrides,
  };
}

export function makeConsistency(overrides: Partial<ConsistencySignals> = {}): ConsistencySignals {
  return {
    score:                0.85,
    crossSignalConflicts: [],
    timelineConsistent:   true,
    narrativeCoherent:    true,
    rawAssessment:        "",
    ...overrides,
  };
}

export function makeSignals(overrides: {
  visual?:      Partial<VisualSignals>;
  text?:        Partial<TextSignals>;
  consistency?: Partial<ConsistencySignals>;
} = {}): MergedSignals {
  return {
    classifier: {
      claimType:  PipelineClaimType.damaged_in_transit,
      confidence: 0.90,
      reasoning:  "Item described as damaged during transit.",
    },
    visual:      makeVisual(overrides.visual),
    text:        makeText(overrides.text),
    consistency: makeConsistency(overrides.consistency),
  };
}

// ── Retailer rule builder ─────────────────────────────────────────────────────

export function makeRetailerRules(overrides: Partial<RetailerRuleSet> = {}): RetailerRuleSet {
  return {
    retailerId:                       "test",
    returnWindowDays:                 30,
    maxClaimValueMinorUnits:          50000,
    policyValueThresholdMinorUnits:   20000,
    disabledRules:                    [],
    ...overrides,
  };
}
