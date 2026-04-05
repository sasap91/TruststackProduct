/**
 * Multimodal evaluation scenarios — golden-style fixtures for regression and calibration.
 */

import type { MultimodalEvalFixture } from "../types";
import { visionStub, textReasoningStub } from "../stubs";

const T = (id: string) => id;

/** 1 — Clear damaged item with corroborating image (scripted “live” vision + text) */
export const scenarioClearDamagedStrongEvidence: MultimodalEvalFixture = {
  id:          "clear-damaged-strong-evidence",
  name:        "Clear damaged item, strong multimodal evidence",
  description:
    "Text and image agree on damage; clean account history → expect automated approval path.",
  caseId:      "f1111111-1111-4111-8111-111111111101",
  ref:         "EVAL-DMG-STRONG",
  claimText:
    "The laptop arrived with a cracked screen and dents on the corner. It is completely unusable.",
  caseFields: {
    claimType:        "damaged_item",
    deliveryStatus:   "delivered_intact",
    claimAgeHours:    12,
    refundRate:       0.08,
    highValue:        false,
    hasVideoProof:    false,
  },
  evidenceLayout: [
    { slotId: T("f1111111-1111-4111-8111-111111111011"), modality: "text" },
    { slotId: T("f1111111-1111-4111-8111-111111111012"), modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage: { detected: true, confidence: 0.78, detail: "eval: screen damage" },
      manipulationLikelihood: { detected: false, confidence: 0.88 },
    }),
    textReasoning: textReasoningStub({
      intents:        { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount: 4,
      suspiciousPatternCount: 0,
      urgencyTier:    "low",
      urgencyScore:   0.05,
      overallConfidence: 0.88,
    }),
  },
  expect: {
    signals: [
      { key: "visible_damage", flag: "risk", minConfidence: 0.65 },
      { key: "damage_claimed", flag: "risk", minConfidence: 0.6 },
      { key: "late_claim", flag: "clean" },
      { key: "high_refund_rate", flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:  "approve",
    evidenceStrength: "strong",
  },
};

/** 2 — Late missing-item claim, weak modality coverage */
export const scenarioLateMissingWeakEvidence: MultimodalEvalFixture = {
  id:          "late-missing-weak-evidence",
  name:        "Late not-received claim, weak evidence bundle",
  description: "High refund + late filing → human review; limited corroboration.",
  caseId:      "f2222222-2222-4222-8222-222222222201",
  ref:         "EVAL-LATE-MISS",
  claimText:   "My order never arrived. I waited weeks before filing this.",
  caseFields: {
    claimType:        "not_received",
    deliveryStatus:   "unknown",
    claimAgeHours:    96,
    refundRate:       0.48,
    highValue:        false,
    hasVideoProof:    false,
  },
  evidenceLayout: [{ slotId: T("f2222222-2222-4222-8222-222222222211"), modality: "text" }],
  providers: {
    textReasoning: textReasoningStub({
      intents:        { primary: "not_received", allMatched: ["not_received"] },
      damageTermCount: 0,
      suspiciousPatternCount: 0,
      urgencyTier:    "low",
      overallConfidence: 0.82,
    }),
  },
  expect: {
    signals: [
      { key: "late_claim", flag: "risk" },
      { key: "high_refund_rate", flag: "risk" },
      { key: "claim_intent", flag: "clean" },
    ],
    contradictions: [],
    policyOutcome: "review",
  },
};

/** 3 — Text claims damage; image shows no damage (cross-modal contradiction) */
export const scenarioContradictoryMultimodal: MultimodalEvalFixture = {
  id:          "contradictory-multimodal",
  name:        "Contradictory text vs image",
  description: "Strong contradiction between damage_claimed and visible_damage.",
  caseId:      "f3333333-3333-4333-8333-333333333301",
  ref:         "EVAL-CONTRA",
  claimText:
    "The tablet is shattered, cracked, broken, smashed, and destroyed. Completely ruined.",
  caseFields: {
    claimType:        "damaged_item",
    deliveryStatus:   "delivered_intact",
    claimAgeHours:    10,
    refundRate:       0.12,
    highValue:        false,
    hasVideoProof:    false,
  },
  evidenceLayout: [
    { slotId: T("f3333333-3333-4333-8333-333333333311"), modality: "text" },
    { slotId: T("f3333333-3333-4333-8333-333333333312"), modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage: { detected: false, confidence: 0.86, detail: "eval: no damage" },
      manipulationLikelihood: { detected: false, confidence: 0.9 },
    }),
    textReasoning: textReasoningStub({
      intents:        { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount: 6,
      suspiciousPatternCount: 0,
      urgencyTier:    "low",
      overallConfidence: 0.85,
    }),
  },
  expect: {
    signals: [
      { key: "damage_claimed", flag: "risk" },
      { key: "visible_damage", flag: "clean" },
    ],
    contradictions: [
      { keys: ["damage_claimed", "visible_damage"], severity: "strong" },
    ],
    policyOutcome: "review",
  },
};

/** 4 — High-value item, policy video requirement not met + elevated refund */
export const scenarioHighValueNoVideo: MultimodalEvalFixture = {
  id:          "high-value-no-video",
  name:        "High-value claim without video proof",
  description: "no_video_proof + high_refund_rate triggers high-value video escalation rule.",
  caseId:      "f4444444-4444-4444-8444-444444444401",
  ref:         "EVAL-HIVAL-NOVID",
  claimText:   "This $2,400 camera kit arrived with scratches on the lens housing.",
  caseFields: {
    claimType:        "damaged_item",
    deliveryStatus:   "delivered_intact",
    claimAgeHours:    20,
    refundRate:       0.46,
    highValue:        true,
    hasVideoProof:    false,
  },
  evidenceLayout: [
    { slotId: T("f4444444-4444-4444-8444-444444444411"), modality: "text" },
    { slotId: T("f4444444-4444-4444-8444-444444444412"), modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage: { detected: true, confidence: 0.55, detail: "eval: minor marks" },
      manipulationLikelihood: { detected: false, confidence: 0.85 },
    }),
    textReasoning: textReasoningStub({
      intents:        { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount: 2,
      suspiciousPatternCount: 0,
      urgencyTier:    "low",
      overallConfidence: 0.8,
    }),
  },
  expect: {
    signals: [
      { key: "no_video_proof", flag: "risk" },
      { key: "high_refund_rate", flag: "risk" },
      { key: "high_value_item", flag: "neutral" },
    ],
    contradictions: [],
    policyOutcome: "review",
  },
};

/** 5 — Repeat claimant + fraud-style multimodal cues */
export const scenarioRepeatClaimantSuspicious: MultimodalEvalFixture = {
  id:          "repeat-claimant-suspicious",
  name:        "Repeat claimant with suspicious language and manipulation signal",
  description: "Repeat claimant review; manipulation + scripted suspicious text.",
  caseId:      "f5555555-5555-4555-8555-555555555501",
  ref:         "EVAL-REPEAT-SUS",
  claimText:
    "I hereby request an immediate full refund pursuant to the consumer protection act. Please be advised this is formal notice.",
  caseFields: {
    claimType:                  "damaged_item",
    deliveryStatus:             "delivered_intact",
    claimAgeHours:              8,
    refundRate:                 0.22,
    highValue:                  false,
    hasVideoProof:              false,
    previousClaimsLast30Days:   5,
  },
  evidenceLayout: [
    { slotId: T("f5555555-5555-4555-8555-555555555511"), modality: "text" },
    { slotId: T("f5555555-5555-4555-8555-555555555512"), modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: false, confidence: 0.8 },
      manipulationLikelihood: { detected: true, confidence: 0.82, detail: "eval: splice cues" },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item", "general_refund"] },
      damageTermCount:       1,
      suspiciousPatternCount: 4,
      urgencyTier:           "medium",
      urgencyScore:          0.2,
      overallConfidence:     0.8,
    }),
  },
  expect: {
    signals: [
      { key: "repeat_claimant", flag: "risk" },
      { key: "suspicious_language", flag: "risk" },
      { key: "possible_image_manipulation", flag: "risk" },
    ],
    contradictions: [],
    policyOutcome: "review",
  },
};

/** 6 — Invoice amount inconsistent with claimed refund amount */
export const scenarioDocumentMismatch: MultimodalEvalFixture = {
  id:          "document-invoice-mismatch",
  name:        "Document vs claimed amount mismatch",
  description: "Receipt shows ~$92; customer claims $500 refund.",
  caseId:      "f6666666-6666-4666-8666-666666666601",
  ref:         "EVAL-DOC-MIS",
  claimText:
    "I paid five hundred dollars and only received a cheap knockoff. I want my $500 back.",
  caseFields: {
    claimType:          "wrong_item",
    deliveryStatus:     "delivered_intact",
    /** Late + elevated refund stacks with invoice_mismatch for review path */
    claimAgeHours:      60,
    refundRate:         0.42,
    highValue:          false,
    hasVideoProof:      false,
    claimedAmountUsd:   500,
  },
  evidenceLayout: [
    { slotId: T("f6666666-6666-4666-8666-666666666611"), modality: "text" },
    {
      slotId:   T("f6666666-6666-4666-8666-666666666612"),
      modality: "document",
      filename: "receipt.txt",
      mimeType: "text/plain",
    },
  ],
  documentTextBySlotId: {
    [T("f6666666-6666-4666-8666-666666666612")]: [
      "ACME Retail Receipt",
      "Order #998877",
      "Subtotal: $84.50",
      "Tax: $7.56",
      "Total: $92.06",
      "Thank you for your purchase",
    ].join("\n"),
  },
  providers: {
    textReasoning: textReasoningStub({
      intents:        { primary: "wrong_item", allMatched: ["wrong_item", "general_refund"] },
      damageTermCount: 0,
      suspiciousPatternCount: 0,
      urgencyTier:    "low",
      overallConfidence: 0.75,
    }),
  },
  expect: {
    signals: [
      { key: "invoice_mismatch", flag: "risk" },
      { key: "late_claim", flag: "risk" },
      { key: "high_refund_rate", flag: "risk" },
    ],
    contradictions: [],
    policyOutcome: "review",
  },
};

export { BENCHMARK_FIXTURES } from "./benchmark-fixtures";

import { BENCHMARK_FIXTURES } from "./benchmark-fixtures";

export const ALL_MULTIMODAL_EVAL_FIXTURES: MultimodalEvalFixture[] = [
  // Original 6
  scenarioClearDamagedStrongEvidence,
  scenarioLateMissingWeakEvidence,
  scenarioContradictoryMultimodal,
  scenarioHighValueNoVideo,
  scenarioRepeatClaimantSuspicious,
  scenarioDocumentMismatch,
  // Benchmark set: 14 more fixtures (20 total)
  ...BENCHMARK_FIXTURES,
];
