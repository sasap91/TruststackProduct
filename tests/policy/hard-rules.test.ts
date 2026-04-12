import { describe, it, expect } from "vitest";
import { runPolicyEngine } from "@/lib/truststack/pipeline/policy-engine";
import { makeInput, makeSignals, makeRetailerRules } from "./helpers";

describe("HARD_001 — AI-Generated Photo Detected", () => {
  const rules = makeRetailerRules();

  it("rejects when aiGeneratedPhotoDetected is true", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { aiGeneratedPhotoDetected: true } }),
      rules,
    );
    expect(decision.outcome).toBe("reject");
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("HARD_001");
  });

  it("does not trigger when photo is not AI-generated", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { aiGeneratedPhotoDetected: false } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("HARD_001");
  });

  it("does not trigger when visual is skipped (no photos)", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { skipped: true, aiGeneratedPhotoDetected: true } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("HARD_001");
    expect(decision.outcome).toBe("approve");
  });

  it("short-circuits: no other rules evaluated after HARD_001 fires", () => {
    // Set up conditions that would also trigger FRAUD rules if evaluation continued
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({
        visual: {
          aiGeneratedPhotoDetected: true,
          photoMatchesDescription: false,   // would be FRAUD_004
          suspiciousElements: ["staging"],  // would be FRAUD_005
        },
        text: { timelineAnomaly: true },    // would be FRAUD_001
        consistency: { score: 0.10 },       // would also be HARD_002
      }),
      rules,
    );
    const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
    expect(ruleIds).toEqual(["HARD_001"]);
    expect(decision.outcome).toBe("reject");
    expect(decision.fraudScore).toBe(0);
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { aiGeneratedPhotoDetected: true } }),
      makeRetailerRules({ disabledRules: ["HARD_001"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("HARD_001");
  });
});

describe("HARD_002 — Consistency Score Below Floor", () => {
  const rules = makeRetailerRules();

  const cases: Array<{ score: number; shouldTrigger: boolean }> = [
    { score: 0.0,   shouldTrigger: true  },
    { score: 0.10,  shouldTrigger: true  },
    { score: 0.19,  shouldTrigger: true  },
    { score: 0.199, shouldTrigger: true  },
    { score: 0.20,  shouldTrigger: false }, // boundary — exactly at threshold, no trigger
    { score: 0.21,  shouldTrigger: false },
    { score: 0.50,  shouldTrigger: false },
    { score: 1.0,   shouldTrigger: false },
  ];

  for (const { score, shouldTrigger } of cases) {
    it(`score ${score} → should${shouldTrigger ? "" : " not"} trigger`, () => {
      const decision = runPolicyEngine(
        makeInput(),
        makeSignals({ consistency: { score } }),
        rules,
      );
      const triggered = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(triggered).toContain("HARD_002");
        expect(decision.outcome).toBe("reject");
      } else {
        expect(triggered).not.toContain("HARD_002");
      }
    });
  }

  it("short-circuits: no other rules evaluated after HARD_002 fires", () => {
    const decision = runPolicyEngine(
      makeInput({
        orderValue: 999999, // would trigger ELIG_002
        claimDate: "2027-01-01", // would trigger ELIG_001
      }),
      makeSignals({
        consistency: { score: 0.10 },
        text: { timelineAnomaly: true }, // would trigger FRAUD_001
      }),
      rules,
    );
    const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
    expect(ruleIds).toEqual(["HARD_002"]);
    expect(decision.fraudScore).toBe(0);
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ consistency: { score: 0.05 } }),
      makeRetailerRules({ disabledRules: ["HARD_002"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("HARD_002");
  });
});
