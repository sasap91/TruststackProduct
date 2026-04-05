/**
 * Benchmark fixtures — 14 additional scenarios bringing the total to 20.
 *
 * Distribution:
 *   4 clearly legitimate (approve)
 *   5 obviously fraudulent (reject)
 *   1 ambiguous (review)
 *   4 high-value escalations (review)
 */

import type { MultimodalEvalFixture } from "../types";
import { visionStub, textReasoningStub } from "../stubs";

// ── Legitimate claims (approve) ───────────────────────────────────────────────

/**
 * B-L1: Clean damaged-item with photo + text agreement, first-ever claim.
 * Approve via approve_strong_clean_claim override.
 */
export const benchmarkLegitPhotoProofCleanAccount: MultimodalEvalFixture = {
  id:          "legit-photo-proof-clean-account",
  name:        "Legit damaged item — photo + text agree, clean history",
  description: "Visible damage confirmed by image (0.82 conf) and damage terms in text; zero prior claims, low refund rate → approve.",
  caseId:      "b1000001-0001-4001-8001-000000000101",
  ref:         "BENCH-LEGIT-01",
  claimText:   "The tablet screen is cracked, the casing is dented, the corner is chipped, and the charging port is broken. Arrived completely damaged.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           4,
    refundRate:              0.03,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
  },
  evidenceLayout: [
    { slotId: "b1000001-0001-4001-8001-000000000111", modality: "text" },
    { slotId: "b1000001-0001-4001-8001-000000000112", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: true,  confidence: 0.82, detail: "eval: cracked screen and dented casing" },
      manipulationLikelihood: { detected: false, confidence: 0.91 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        5,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.05,
      overallConfidence:     0.89,
    }),
  },
  expect: {
    signals: [
      { key: "visible_damage",    flag: "risk", minConfidence: 0.70 },
      { key: "damage_claimed",    flag: "risk", minConfidence: 0.65 },
      { key: "late_claim",        flag: "clean" },
      { key: "high_refund_rate",  flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:    "approve",
    evidenceStrength: "strong",
  },
};

/**
 * B-L2: Low-value missing package, first claim, item in transit (not delivered).
 * Very few risk signals → auto-approve via risk score below threshold.
 */
export const benchmarkLegitMissingPackageInTransit: MultimodalEvalFixture = {
  id:          "legit-missing-package-in-transit",
  name:        "Legit missing package — carrier shows in transit, first claim",
  description: "deliveryStatus=in_transit so no delivered_but_claimed_missing signal; clean account → auto-approve.",
  caseId:      "b1000002-0002-4002-8002-000000000201",
  ref:         "BENCH-LEGIT-02",
  claimText:   "My package was supposed to arrive three days ago and I cannot find it.",
  caseFields: {
    claimType:               "not_received",
    deliveryStatus:          "in_transit",
    claimAgeHours:           30,
    refundRate:              0.02,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
  },
  evidenceLayout: [
    { slotId: "b1000002-0002-4002-8002-000000000211", modality: "text" },
  ],
  providers: {
    textReasoning: textReasoningStub({
      intents:               { primary: "not_received", allMatched: ["not_received"] },
      damageTermCount:        0,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.04,
      overallConfidence:     0.88,
    }),
  },
  expect: {
    signals: [
      { key: "late_claim",       flag: "clean" },
      { key: "high_refund_rate", flag: "clean" },
      { key: "claim_intent",     flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:  "approve",
  },
};

/**
 * B-L3: Wrong item received — receipt corroborates claim, clean account.
 * All signals are clean or neutral → auto-approve.
 */
export const benchmarkLegitWrongItemReceiptProof: MultimodalEvalFixture = {
  id:          "legit-wrong-item-receipt-proof",
  name:        "Legit wrong item — receipt corroborates, low risk account",
  description: "Customer received wrong SKU; receipt shows expected item; clean account history → approve.",
  caseId:      "b1000003-0003-4003-8003-000000000301",
  ref:         "BENCH-LEGIT-03",
  claimText:   "I ordered a blue model but received a red one instead. The packing slip is attached.",
  caseFields: {
    claimType:               "wrong_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           8,
    refundRate:              0.07,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
    claimedAmountUsd:        65,
  },
  evidenceLayout: [
    { slotId: "b1000003-0003-4003-8003-000000000311", modality: "text" },
    {
      slotId:   "b1000003-0003-4003-8003-000000000312",
      modality: "document",
      filename: "packing-slip.txt",
      mimeType: "text/plain",
    },
  ],
  documentTextBySlotId: {
    "b1000003-0003-4003-8003-000000000312": [
      "Order Confirmation",
      "Order #567123",
      "Item: Blue Widget Pro — SKU BW-PRO-BLU",
      "Qty: 1",
      "Subtotal: $62.00",
      "Tax: $3.41",
      "Total: $65.41",
    ].join("\n"),
  },
  providers: {
    textReasoning: textReasoningStub({
      intents:               { primary: "wrong_item", allMatched: ["wrong_item"] },
      damageTermCount:        0,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.02,
      overallConfidence:     0.90,
    }),
  },
  expect: {
    signals: [
      { key: "late_claim",       flag: "clean" },
      { key: "high_refund_rate", flag: "clean" },
      { key: "claim_intent",     flag: "clean" },
      { key: "receipt_present",  flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:  "approve",
  },
};

/**
 * B-L4: Clear genuine damage with corroborating image, mid-range refund rate but
 * within threshold, timely filing. Approve via approve_strong_clean_claim override.
 */
export const benchmarkLegitDamagedItemTimely: MultimodalEvalFixture = {
  id:          "legit-damaged-item-timely-filing",
  name:        "Legit damaged item — timely, clean rate, high-confidence image",
  description: "Item visibly damaged (0.76 conf), text has 4+ damage terms, filed within 48h, refundRate under threshold → approve.",
  caseId:      "b1000004-0004-4004-8004-000000000401",
  ref:         "BENCH-LEGIT-04",
  claimText:   "The outer packaging was torn open and the ceramic mug inside was shattered, chipped, and cracked into several pieces.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           22,
    refundRate:              0.09,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
  },
  evidenceLayout: [
    { slotId: "b1000004-0004-4004-8004-000000000411", modality: "text" },
    { slotId: "b1000004-0004-4004-8004-000000000412", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: true,  confidence: 0.76, detail: "eval: shattered item visible" },
      manipulationLikelihood: { detected: false, confidence: 0.93 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        4,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.03,
      overallConfidence:     0.87,
    }),
  },
  expect: {
    signals: [
      { key: "visible_damage",   flag: "risk", minConfidence: 0.70 },
      { key: "damage_claimed",   flag: "risk", minConfidence: 0.65 },
      { key: "late_claim",       flag: "clean" },
      { key: "high_refund_rate", flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:    "approve",
    evidenceStrength: "strong",
  },
};

// ── Obviously fraudulent (reject) ─────────────────────────────────────────────

/**
 * B-F1: Carrier confirmed delivery + repeat claimant (4 prior claims) + no receipt.
 * Triggers reject_delivered_repeat_no_evidence OVERRIDE rule.
 */
export const benchmarkFraudDeliveredRepeatNoReceipt: MultimodalEvalFixture = {
  id:          "fraud-carrier-delivered-repeat-no-receipt",
  name:        "Fraud: carrier confirmed delivery, repeat claimant, no receipt",
  description: "Carrier scan shows delivery; claimant has 4 prior claims in 30 days; no document evidence → reject override.",
  caseId:      "b2000001-0001-4001-8001-000000000501",
  ref:         "BENCH-FRAUD-01",
  claimText:   "My package never arrived. I have been waiting and nothing showed up at my door.",
  caseFields: {
    claimType:               "not_received",
    deliveryStatus:          "delivered_intact",  // must match exactly for delivered_but_claimed_missing to fire
    claimAgeHours:           16,
    refundRate:              0.18,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 4,
  },
  evidenceLayout: [
    { slotId: "b2000001-0001-4001-8001-000000000511", modality: "text" },
  ],
  providers: {
    textReasoning: textReasoningStub({
      intents:               { primary: "not_received", allMatched: ["not_received"] },
      damageTermCount:        0,
      suspiciousPatternCount: 1,
      urgencyTier:           "low",
      urgencyScore:          0.06,
      overallConfidence:     0.85,
    }),
  },
  expect: {
    signals: [
      { key: "delivered_but_claimed_missing", flag: "risk" },
      { key: "repeat_claimant",              flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "reject",
  },
};

/**
 * B-F2: Critical risk + image manipulation + scripted legal language.
 * Triggers reject_critical_multimodal_fraud OVERRIDE rule.
 */
export const benchmarkFraudCriticalManipulationLegalText: MultimodalEvalFixture = {
  id:          "fraud-critical-manipulation-legal-language",
  name:        "Fraud: critical risk, image manipulation, scripted legal phrasing",
  description: "High manipulation confidence + heavy suspicious language + repeat account → critical risk → reject override.",
  caseId:      "b2000002-0002-4002-8002-000000000601",
  ref:         "BENCH-FRAUD-02",
  claimText:
    "I hereby formally demand a full refund pursuant to applicable consumer protection statutes. Please be advised this constitutes official notice of my legal claim. I reserve all rights.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           120,
    refundRate:              0.65,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 6,
  },
  evidenceLayout: [
    { slotId: "b2000002-0002-4002-8002-000000000611", modality: "text" },
    { slotId: "b2000002-0002-4002-8002-000000000612", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: false, confidence: 0.87 },
      manipulationLikelihood: { detected: true,  confidence: 0.89, detail: "eval: splice artifacts" },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item", "general_refund"] },
      damageTermCount:        4,
      suspiciousPatternCount: 6,
      urgencyTier:           "high",
      urgencyScore:          0.78,
      overallConfidence:     0.82,
    }),
  },
  expect: {
    signals: [
      { key: "possible_image_manipulation", flag: "risk" },
      { key: "suspicious_language",         flag: "risk" },
      { key: "repeat_claimant",             flag: "risk" },
      { key: "high_refund_rate",            flag: "risk" },
      { key: "late_claim",                  flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "reject",
  },
};

/**
 * B-F3: Elevated refund rate + very late filing + repeat account.
 * high_refund_rate + late_claim + repeat_claimant → review (reject_refund_late_weak needs insufficient
 * evidenceStrength; with repeat signals present the fusion lifts above that threshold).
 */
export const benchmarkFraudHighRefundLateWeakEvidence: MultimodalEvalFixture = {
  id:          "fraud-high-refund-late-weak-evidence",
  name:        "Fraud: high refund rate + very late claim + text-only evidence",
  description: "refundRate=0.75 + claimAgeHours=150 + repeat claimant → high_refund_late combination → review escalation.",
  caseId:      "b2000003-0003-4003-8003-000000000701",
  ref:         "BENCH-FRAUD-03",
  claimText:   "I never received my order. I have been trying to contact support for a while.",
  caseFields: {
    claimType:               "not_received",
    deliveryStatus:          "unknown",
    claimAgeHours:           150,
    refundRate:              0.75,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 4,  // repeat_claimant=risk ensures review/reject regardless of evidenceStrength
  },
  evidenceLayout: [
    { slotId: "b2000003-0003-4003-8003-000000000711", modality: "text" },
  ],
  providers: {
    textReasoning: textReasoningStub({
      intents:               { primary: "not_received", allMatched: ["not_received"] },
      damageTermCount:        0,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.05,
      overallConfidence:     0.80,
    }),
  },
  expect: {
    signals: [
      { key: "high_refund_rate", flag: "risk" },
      { key: "late_claim",       flag: "risk" },
      { key: "repeat_claimant",  flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "review",
  },
};

/**
 * B-F4: Maximum fraud signal saturation → auto-reject via risk score ≥ 0.88.
 * Every category has multiple high-weight risk signals.
 */
export const benchmarkFraudAutoRejectHighRiskSaturation: MultimodalEvalFixture = {
  id:          "fraud-auto-reject-signal-saturation",
  name:        "Fraud: full risk signal saturation → auto-reject threshold",
  description: "Manipulation + suspicious text + repeat + high refund + very late + high value + no video → risk score ≥ 0.88 auto-reject.",
  caseId:      "b2000004-0004-4004-8004-000000000801",
  ref:         "BENCH-FRAUD-04",
  claimText:
    "The product is shattered, destroyed, cracked, broken, smashed, and completely ruined. I demand immediate full refund plus compensation. This is unacceptable.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           200,
    refundRate:              0.82,
    highValue:               true,
    hasVideoProof:           false,
    previousClaimsLast30Days: 8,
  },
  evidenceLayout: [
    { slotId: "b2000004-0004-4004-8004-000000000811", modality: "text" },
    { slotId: "b2000004-0004-4004-8004-000000000812", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: false, confidence: 0.88 },
      manipulationLikelihood: { detected: true,  confidence: 0.92, detail: "eval: heavy artifacts" },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item", "general_refund"] },
      damageTermCount:        6,
      suspiciousPatternCount: 5,
      urgencyTier:           "high",
      urgencyScore:          0.85,
      overallConfidence:     0.88,
    }),
  },
  expect: {
    signals: [
      { key: "possible_image_manipulation", flag: "risk" },
      { key: "suspicious_language",         flag: "risk" },
      { key: "high_refund_rate",            flag: "risk" },
      { key: "repeat_claimant",             flag: "risk" },
      { key: "late_claim",                  flag: "risk" },
      { key: "no_video_proof",              flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "reject",
  },
};

/**
 * B-F5: Copy-paste scripted template claim with image manipulation cues.
 * Triggers reject_critical_multimodal_fraud via critical risk level.
 */
export const benchmarkFraudCopyPasteScriptedTemplate: MultimodalEvalFixture = {
  id:          "fraud-copy-paste-scripted-template",
  name:        "Fraud: copy-paste template language + image manipulation",
  description: "Heavy scripted language (8 suspicious patterns) + manipulation + repeat account → critical risk → reject.",
  caseId:      "b2000005-0005-4005-8005-000000000901",
  ref:         "BENCH-FRAUD-05",
  claimText:
    "Pursuant to your return policy I am formally notifying you of product defect. Item is defective, broken, damaged, and unusable. Please process my refund within 24 hours or I will dispute.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           72,
    refundRate:              0.58,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 4,
  },
  evidenceLayout: [
    { slotId: "b2000005-0005-4005-8005-000000000911", modality: "text" },
    { slotId: "b2000005-0005-4005-8005-000000000912", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: false, confidence: 0.82 },
      manipulationLikelihood: { detected: true,  confidence: 0.78, detail: "eval: metadata inconsistency" },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item", "general_refund"] },
      damageTermCount:        5,
      suspiciousPatternCount: 8,
      urgencyTier:           "high",
      urgencyScore:          0.72,
      overallConfidence:     0.84,
    }),
  },
  expect: {
    signals: [
      { key: "possible_image_manipulation", flag: "risk" },
      { key: "suspicious_language",         flag: "risk" },
      { key: "repeat_claimant",             flag: "risk" },
      { key: "high_refund_rate",            flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "reject",
  },
};

// ── Ambiguous (review) ────────────────────────────────────────────────────────

/**
 * B-A1: Mixed signals — some damage detected but below confidence threshold for auto-approve,
 * borderline refund rate, single prior claim. Falls into review via high risk band.
 */
export const benchmarkAmbiguousMixedBorderlineSignals: MultimodalEvalFixture = {
  id:          "ambiguous-mixed-borderline-signals",
  name:        "Ambiguous: partial damage, borderline refund rate, low urgency",
  description: "Visible damage at 0.58 confidence (below 0.70 approve threshold), refundRate 0.38, 3 prior claims (repeat_claimant=risk) → review_repeat_claimant fires.",
  caseId:      "b3000001-0001-4001-8001-000000001001",
  ref:         "BENCH-AMB-01",
  claimText:   "The item looks slightly bent on one side. I'm not sure if it happened in shipping.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           36,
    refundRate:              0.38,
    highValue:               false,
    hasVideoProof:           false,
    previousClaimsLast30Days: 3,  // repeat_claimant threshold is 3 → flag=risk
  },
  evidenceLayout: [
    { slotId: "b3000001-0001-4001-8001-000000001011", modality: "text" },
    { slotId: "b3000001-0001-4001-8001-000000001012", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: true, confidence: 0.58, detail: "eval: minor deformation" },
      manipulationLikelihood: { detected: false, confidence: 0.88 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        2,
      suspiciousPatternCount: 1,
      urgencyTier:           "low",
      urgencyScore:          0.07,
      overallConfidence:     0.82,
    }),
  },
  expect: {
    signals: [
      { key: "visible_damage",   flag: "risk" },
      { key: "repeat_claimant",  flag: "risk" },
      { key: "late_claim",       flag: "clean" },
    ],
    contradictions: [],
    policyOutcome:  "review",
  },
};

// ── High-value escalations (review) ──────────────────────────────────────────

/**
 * B-H1: Luxury item, high refund rate, no video → review_high_value_no_video_risk_account.
 */
export const benchmarkHighValueLuxuryHighRefund: MultimodalEvalFixture = {
  id:          "high-value-luxury-high-refund",
  name:        "High-value: luxury item, elevated refund rate, no video",
  description: "highValue=true, refundRate=0.45, no video → review (high-value no-video rule).",
  caseId:      "b4000001-0001-4001-8001-000000001101",
  ref:         "BENCH-HVAL-01",
  claimText:   "The watch arrived with scratches on the crystal and the clasp is misaligned.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           15,
    refundRate:              0.45,
    highValue:               true,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
  },
  evidenceLayout: [
    { slotId: "b4000001-0001-4001-8001-000000001111", modality: "text" },
    { slotId: "b4000001-0001-4001-8001-000000001112", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: true, confidence: 0.61, detail: "eval: minor surface marks" },
      manipulationLikelihood: { detected: false, confidence: 0.90 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        3,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.04,
      overallConfidence:     0.84,
    }),
  },
  expect: {
    signals: [
      { key: "no_video_proof",   flag: "risk" },
      { key: "high_value_item",  flag: "neutral" },
      { key: "high_refund_rate", flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "review",
  },
};

/**
 * B-H2: High-value item, repeat claimant (4 prior), no video → escalate to review.
 */
export const benchmarkHighValueRepeatAccount: MultimodalEvalFixture = {
  id:          "high-value-repeat-account",
  name:        "High-value: repeat claimant (4 prior), no video proof",
  description: "highValue=true, previousClaimsLast30Days=4, no video → review (high-value no-video rule).",
  caseId:      "b4000002-0002-4002-8002-000000001201",
  ref:         "BENCH-HVAL-02",
  claimText:   "The laptop has a dead pixel cluster on the screen and the keyboard is sticking.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           18,
    refundRate:              0.14,
    highValue:               true,
    hasVideoProof:           false,
    previousClaimsLast30Days: 4,
  },
  evidenceLayout: [
    { slotId: "b4000002-0002-4002-8002-000000001211", modality: "text" },
    { slotId: "b4000002-0002-4002-8002-000000001212", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: true, confidence: 0.59, detail: "eval: minor defects" },
      manipulationLikelihood: { detected: false, confidence: 0.88 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        2,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.05,
      overallConfidence:     0.86,
    }),
  },
  expect: {
    signals: [
      { key: "no_video_proof",  flag: "risk" },
      { key: "repeat_claimant", flag: "risk" },
      { key: "high_value_item", flag: "neutral" },
    ],
    contradictions: [],
    policyOutcome:  "review",
  },
};

/**
 * B-H3: High-value electronics — text claims damage but image shows none (contradiction),
 * borderline refund rate, no video.
 * Strong contradiction + high-value no-video → review.
 */
export const benchmarkHighValueElectronicsContradiction: MultimodalEvalFixture = {
  id:          "high-value-electronics-contradiction",
  name:        "High-value: text claims damage but image contradicts, borderline refund",
  description: "damage_claimed (risk) vs visible_damage (clean) → strong contradiction; highValue + high_refund_rate → review.",
  caseId:      "b4000003-0003-4003-8003-000000001301",
  ref:         "BENCH-HVAL-03",
  claimText:   "The TV screen is cracked, broken, shattered and damaged from the inside.",
  caseFields: {
    claimType:               "damaged_item",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           40,
    refundRate:              0.41,
    highValue:               true,
    hasVideoProof:           false,
    previousClaimsLast30Days: 0,
  },
  evidenceLayout: [
    { slotId: "b4000003-0003-4003-8003-000000001311", modality: "text" },
    { slotId: "b4000003-0003-4003-8003-000000001312", modality: "image" },
  ],
  providers: {
    vision: visionStub({
      visibleDamage:          { detected: false, confidence: 0.87, detail: "eval: screen intact" },
      manipulationLikelihood: { detected: false, confidence: 0.90 },
    }),
    textReasoning: textReasoningStub({
      intents:               { primary: "damaged_item", allMatched: ["damaged_item"] },
      damageTermCount:        4,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.06,
      overallConfidence:     0.85,
    }),
  },
  expect: {
    signals: [
      { key: "damage_claimed",  flag: "risk" },
      { key: "visible_damage",  flag: "clean" },
      { key: "no_video_proof",  flag: "risk" },
      { key: "high_refund_rate",flag: "risk" },
    ],
    contradictions: [
      { keys: ["damage_claimed", "visible_damage"], severity: "strong" },
    ],
    policyOutcome: "review",
  },
};

/**
 * B-H4: High-value not-received claim — carrier shows delivered, repeat account.
 * Reject override doesn't fire (repeat count=2 < threshold); high-value + refundRate → review.
 */
export const benchmarkHighValueMissingItemRepeat: MultimodalEvalFixture = {
  id:          "high-value-missing-item-high-refund",
  name:        "High-value: missing item claim, carrier delivered, high refund rate",
  description: "Delivered but claimed missing; highValue=true; refundRate=0.55; previousClaims=2 (below reject threshold) → review.",
  caseId:      "b4000004-0004-4004-8004-000000001401",
  ref:         "BENCH-HVAL-04",
  claimText:   "I never received my order. The tracking shows delivered but nothing arrived.",
  caseFields: {
    claimType:               "not_received",
    deliveryStatus:          "delivered_intact",
    claimAgeHours:           20,
    refundRate:              0.55,
    highValue:               true,
    hasVideoProof:           false,
    previousClaimsLast30Days: 2,
  },
  evidenceLayout: [
    { slotId: "b4000004-0004-4004-8004-000000001411", modality: "text" },
  ],
  providers: {
    textReasoning: textReasoningStub({
      intents:               { primary: "not_received", allMatched: ["not_received"] },
      damageTermCount:        0,
      suspiciousPatternCount: 0,
      urgencyTier:           "low",
      urgencyScore:          0.08,
      overallConfidence:     0.83,
    }),
  },
  expect: {
    signals: [
      { key: "delivered_but_claimed_missing", flag: "risk" },
      { key: "high_refund_rate",             flag: "risk" },
      { key: "no_video_proof",               flag: "risk" },
    ],
    contradictions: [],
    policyOutcome:  "review",
  },
};

// ── Exports ───────────────────────────────────────────────────────────────────

export const BENCHMARK_FIXTURES: MultimodalEvalFixture[] = [
  // Legitimate (approve)
  benchmarkLegitPhotoProofCleanAccount,
  benchmarkLegitMissingPackageInTransit,
  benchmarkLegitWrongItemReceiptProof,
  benchmarkLegitDamagedItemTimely,
  // Fraudulent (reject)
  benchmarkFraudDeliveredRepeatNoReceipt,
  benchmarkFraudCriticalManipulationLegalText,
  benchmarkFraudHighRefundLateWeakEvidence,
  benchmarkFraudAutoRejectHighRiskSaturation,
  benchmarkFraudCopyPasteScriptedTemplate,
  // Ambiguous (review)
  benchmarkAmbiguousMixedBorderlineSignals,
  // High-value escalations (review)
  benchmarkHighValueLuxuryHighRefund,
  benchmarkHighValueRepeatAccount,
  benchmarkHighValueElectronicsContradiction,
  benchmarkHighValueMissingItemRepeat,
];
