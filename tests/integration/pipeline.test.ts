/**
 * Integration tests for the TrustStack deterministic pipeline.
 *
 * Strategy: mock the four LLM step modules (classifier, visual, text,
 * consistency) so no real network calls are made. The orchestrator,
 * signal-merge, policy engine, and audit writer all run for real.
 *
 * This tests the wiring of the full pipeline without coupling to Anthropic
 * SDK internals or network availability.
 *
 * Test scenarios:
 *   1. Clean approve    — no fraud signals, within policy thresholds
 *   2. Hard reject      — HARD_001: AI-generated photo detected
 *   3. Fraud reject     — FRAUD_001(+25) + FRAUD_004(+30) + FRAUD_005(+20) = 75
 *   4. Approve flagged  — FRAUD_002(+15) + FRAUD_003(+20) = 35
 *   5. Visual skipped   — never_arrived: extract_visual returns VISUAL_SKIPPED
 *   6. ELIG_001 reject  — claim outside return window
 *   7. ELIG_003 reject  — classifier confidence below 0.40
 *   8. Audit writer     — called once with correct claimId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock functions ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  classify:    vi.fn(),
  visual:      vi.fn(),
  text:        vi.fn(),
  consistency: vi.fn(),
}));

vi.mock("@/lib/truststack/pipeline/classifier", () => ({
  classify_claim: mocks.classify,
}));

vi.mock("@/lib/truststack/pipeline/visual", () => ({
  extract_visual: mocks.visual,
  shouldSkipVisual: vi.fn().mockReturnValue(false),
  VISUAL_SKIPPED: {
    skipped: true,
    aiGeneratedPhotoDetected: false,
    photoMatchesDescription:  null,
    damageVisible:            null,
    suspiciousElements:       [],
    rawAssessment:            "",
  },
}));

vi.mock("@/lib/truststack/pipeline/text", () => ({
  extract_text: mocks.text,
}));

vi.mock("@/lib/truststack/pipeline/consistency", () => ({
  check_consistency: mocks.consistency,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runPipeline } from "@/lib/truststack/pipeline/index";
import { PipelineClaimType } from "@/lib/truststack/types/claim";
import type { PipelineClaimInput } from "@/lib/truststack/types/claim";
import type { ClassifierOutput } from "@/lib/truststack/types/claim";
import type { VisualSignals, TextSignals, ConsistencySignals } from "@/lib/truststack/types/signals";

// ── Fixture signal objects ────────────────────────────────────────────────────

const CLASSIFIER_DAMAGED: ClassifierOutput = {
  claimType:  PipelineClaimType.damaged_in_transit,
  confidence: 0.92,
  reasoning:  "Item reported as physically damaged on arrival.",
};

const CLASSIFIER_NEVER_ARRIVED: ClassifierOutput = {
  claimType:  PipelineClaimType.never_arrived,
  confidence: 0.95,
  reasoning:  "Customer states item was never delivered.",
};

const CLASSIFIER_LOW_CONF: ClassifierOutput = {
  claimType:  PipelineClaimType.wrong_item,
  confidence: 0.35,
  reasoning:  "Cannot reliably distinguish claim type.",
};

const VISUAL_CLEAN: VisualSignals = {
  skipped:                  false,
  aiGeneratedPhotoDetected: false,
  photoMatchesDescription:  true,
  damageVisible:            true,
  suspiciousElements:       [],
  rawAssessment:            "Photos show genuine transit damage.",
};

const VISUAL_SKIPPED: VisualSignals = {
  skipped:                  true,
  aiGeneratedPhotoDetected: false,
  photoMatchesDescription:  null,
  damageVisible:            null,
  suspiciousElements:       [],
  rawAssessment:            "",
};

const VISUAL_AI_GENERATED: VisualSignals = {
  skipped:                  false,
  aiGeneratedPhotoDetected: true,
  photoMatchesDescription:  false,
  damageVisible:            false,
  suspiciousElements:       ["AI-generated imagery"],
  rawAssessment:            "Submitted photos are AI-generated.",
};

const VISUAL_FRAUD: VisualSignals = {
  skipped:                  false,
  aiGeneratedPhotoDetected: false,
  photoMatchesDescription:  false,
  damageVisible:            false,
  suspiciousElements:       ["staged background", "mismatched lighting"],
  rawAssessment:            "Photos do not match claim; suspicious elements detected.",
};

const VISUAL_FLAGGED: VisualSignals = {
  skipped:                  false,
  aiGeneratedPhotoDetected: false,
  photoMatchesDescription:  true,
  damageVisible:            true,
  suspiciousElements:       [],
  rawAssessment:            "Photos appear genuine.",
};

const TEXT_CLEAN: TextSignals = {
  claimsConsistentWithType: true,
  timelineAnomaly:          false,
  highValueLanguage:        false,
  evidenceDocumentsPresent: false,
  parsedDocuments:          [],
  redFlags:                 [],
};

const TEXT_FRAUD: TextSignals = {
  claimsConsistentWithType: true,
  timelineAnomaly:          true,
  highValueLanguage:        false,
  evidenceDocumentsPresent: false,
  parsedDocuments:          [],
  redFlags:                 ["Timeline inconsistency detected."],
};

const TEXT_FLAGGED: TextSignals = {
  claimsConsistentWithType: true,
  timelineAnomaly:          false,
  highValueLanguage:        true,
  evidenceDocumentsPresent: false,
  parsedDocuments:          [],
  redFlags:                 ["Formal demand language detected."],
};

const CONSISTENCY_CLEAN: ConsistencySignals = {
  score:                0.90,
  crossSignalConflicts: [],
  timelineConsistent:   true,
  narrativeCoherent:    true,
  rawAssessment:        "All signals are consistent.",
};

const CONSISTENCY_FRAUD: ConsistencySignals = {
  score:                0.55,
  crossSignalConflicts: [],
  timelineConsistent:   false,
  narrativeCoherent:    false,
  rawAssessment:        "Timeline anomaly and photo mismatch undermine credibility.",
};

const CONSISTENCY_FLAGGED: ConsistencySignals = {
  score:                0.68,
  crossSignalConflicts: ["High-value language inconsistent with absence of evidence"],
  timelineConsistent:   true,
  narrativeCoherent:    true,
  rawAssessment:        "Moderate consistency; one cross-signal conflict.",
};

// ── Shared input ──────────────────────────────────────────────────────────────

const BASE_INPUT: PipelineClaimInput = {
  claimId:          "int-test-001",
  retailerId:       "retailer-test",
  customerId:       "customer-001",
  orderDate:        "2026-03-01",
  claimDate:        "2026-03-08",   // 7 days — within 30-day window
  orderValue:       5000,
  currency:         "USD",
  productTitle:     "Widget Pro 3000",
  productSku:       "WP-3000",
  claimDescription: "The item arrived with a cracked casing.",
  evidenceUrls:     [],
  photoUrls:        ["https://cdn.example.com/photo.jpg"],
  metadata:         {},
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Pipeline integration — clean approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_CLEAN);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("returns approve with zero fraud score and no triggered rules", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("approve");
    expect(decision.fraudScore).toBe(0);
    expect(decision.triggeredRules).toHaveLength(0);
    expect(decision.claimId).toBe("int-test-001");
  });

  it("decision has a valid ISO 8601 timestamp", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(() => new Date(decision.timestamp)).not.toThrow();
    expect(new Date(decision.timestamp).toISOString()).toBe(decision.timestamp);
  });

  it("calls all four pipeline steps", async () => {
    await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.visual).toHaveBeenCalledTimes(1);
    expect(mocks.text).toHaveBeenCalledTimes(1);
    expect(mocks.consistency).toHaveBeenCalledTimes(1);
  });

  it("passes classifier output to visual and text steps", async () => {
    await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(mocks.visual).toHaveBeenCalledWith(BASE_INPUT, CLASSIFIER_DAMAGED);
    expect(mocks.text).toHaveBeenCalledWith(
      BASE_INPUT,
      CLASSIFIER_DAMAGED,
      expect.any(Array), // parsed doc stubs from doc-parser
    );
  });

  it("passes all prior outputs to the consistency step", async () => {
    await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(mocks.consistency).toHaveBeenCalledWith(
      BASE_INPUT,
      CLASSIFIER_DAMAGED,
      VISUAL_CLEAN,
      TEXT_CLEAN,
    );
  });
});

describe("Pipeline integration — HARD_001 hard reject (AI-generated photo)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_AI_GENERATED);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("returns reject and triggers HARD_001", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("reject");
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("HARD_001");
  });

  it("short-circuits: only HARD_001 in triggered rules, fraudScore = 0", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.triggeredRules).toHaveLength(1);
    expect(decision.triggeredRules[0].ruleId).toBe("HARD_001");
    expect(decision.fraudScore).toBe(0);
  });
});

describe("Pipeline integration — fraud score reject (FRAUD_001+FRAUD_004+FRAUD_005 = 75)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_FRAUD);
    mocks.text.mockResolvedValue(TEXT_FRAUD);
    mocks.consistency.mockResolvedValue(CONSISTENCY_FRAUD);
  });

  it("returns reject when fraud score >= 60", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("reject");
    expect(decision.fraudScore).toBeGreaterThanOrEqual(60);
  });

  it("triggers FRAUD_001 (timeline anomaly +25)", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_001");
  });

  it("triggers FRAUD_004 (photo mismatch +30)", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_004");
  });

  it("triggers FRAUD_005 (suspicious elements +20)", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_005");
  });

  it("all fraud rule outcomes are back-filled with the final decision outcome", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    const fraudRules = decision.triggeredRules.filter((r) => r.severity === "fraud");
    expect(fraudRules.length).toBeGreaterThan(0);
    for (const rule of fraudRules) {
      expect(rule.outcome).toBe(decision.outcome);
    }
  });
});

describe("Pipeline integration — approve_flagged (FRAUD_002+FRAUD_003 = 35)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_FLAGGED);
    mocks.text.mockResolvedValue(TEXT_FLAGGED);
    mocks.consistency.mockResolvedValue(CONSISTENCY_FLAGGED);
  });

  it("returns approve_flagged when fraud score is 30–59", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("approve_flagged");
    expect(decision.fraudScore).toBeGreaterThanOrEqual(30);
    expect(decision.fraudScore).toBeLessThan(60);
  });

  it("triggers FRAUD_002 (high-value language) and FRAUD_003 (cross-signal conflict)", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
    expect(ruleIds).toContain("FRAUD_002");
    expect(ruleIds).toContain("FRAUD_003");
  });
});

describe("Pipeline integration — visual skipped for never_arrived", () => {
  const neverArrivedInput: PipelineClaimInput = {
    ...BASE_INPUT,
    claimDescription: "My package was never delivered.",
    photoUrls:        [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_NEVER_ARRIVED);
    mocks.visual.mockResolvedValue(VISUAL_SKIPPED);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("visual step is called and returns skipped=true", async () => {
    await runPipeline(neverArrivedInput, { auditWriter: async () => {} });
    expect(mocks.visual).toHaveBeenCalledTimes(1);
    const [[, classifierArg]] = mocks.visual.mock.calls as [[PipelineClaimInput, ClassifierOutput]];
    expect(classifierArg.claimType).toBe(PipelineClaimType.never_arrived);
  });

  it("returns approve with no fraud flags", async () => {
    const decision = await runPipeline(neverArrivedInput, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("approve");
    expect(decision.fraudScore).toBe(0);
  });

  it("FRAUD_004 and FRAUD_005 do not fire when visual is skipped", async () => {
    const decision = await runPipeline(neverArrivedInput, { auditWriter: async () => {} });
    const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
    expect(ruleIds).not.toContain("FRAUD_004");
    expect(ruleIds).not.toContain("FRAUD_005");
  });
});

describe("Pipeline integration — ELIG_001 reject (return window exceeded)", () => {
  const lateInput: PipelineClaimInput = {
    ...BASE_INPUT,
    orderDate: "2026-01-01",
    claimDate: "2026-04-01",  // 90 days — outside 30-day window
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_CLEAN);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("returns reject and triggers ELIG_001", async () => {
    const decision = await runPipeline(lateInput, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("reject");
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("ELIG_001");
  });
});

describe("Pipeline integration — ELIG_003 reject (low classifier confidence)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_LOW_CONF);
    mocks.visual.mockResolvedValue(VISUAL_CLEAN);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("returns reject when classifier confidence < 0.40", async () => {
    const decision = await runPipeline(BASE_INPUT, { auditWriter: async () => {} });
    expect(decision.outcome).toBe("reject");
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("ELIG_003");
  });
});

describe("Pipeline integration — audit writer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classify.mockResolvedValue(CLASSIFIER_DAMAGED);
    mocks.visual.mockResolvedValue(VISUAL_CLEAN);
    mocks.text.mockResolvedValue(TEXT_CLEAN);
    mocks.consistency.mockResolvedValue(CONSISTENCY_CLEAN);
  });

  it("invokes the audit writer exactly once with the correct claimId", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    await runPipeline(BASE_INPUT, { auditWriter: writer });
    expect(writer).toHaveBeenCalledTimes(1);
    const [record] = writer.mock.calls[0] as [{ claimId: string; pipelineDurationMs: number }];
    expect(record.claimId).toBe("int-test-001");
    expect(typeof record.pipelineDurationMs).toBe("number");
  });

  it("audit record contains model versions with visual=null when skipped", async () => {
    mocks.visual.mockResolvedValue(VISUAL_SKIPPED);
    const writer = vi.fn().mockResolvedValue(undefined);
    await runPipeline(BASE_INPUT, { auditWriter: writer });
    const [record] = writer.mock.calls[0] as [{ modelVersions: { visual: string | null } }];
    expect(record.modelVersions.visual).toBeNull();
  });

  it("audit record contains model versions with visual set when not skipped", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    await runPipeline(BASE_INPUT, { auditWriter: writer });
    const [record] = writer.mock.calls[0] as [{ modelVersions: { visual: string | null } }];
    expect(record.modelVersions.visual).toBe("claude-opus-4-6");
  });
});
