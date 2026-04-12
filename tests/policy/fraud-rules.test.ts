import { describe, it, expect } from "vitest";
import { runPolicyEngine } from "@/lib/truststack/pipeline/policy-engine";
import { makeInput, makeSignals, makeRetailerRules } from "./helpers";

const rules = makeRetailerRules();

describe("FRAUD_001 — Timeline Anomaly (+25)", () => {
  it("adds 25 to fraudScore when timelineAnomaly is true", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { timelineAnomaly: true } }),
      rules,
    );
    expect(decision.fraudScore).toBe(25);
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_001");
  });

  it("does not trigger when timelineAnomaly is false", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { timelineAnomaly: false } }),
      rules,
    );
    expect(decision.fraudScore).toBe(0);
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_001");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { timelineAnomaly: true } }),
      makeRetailerRules({ disabledRules: ["FRAUD_001"] }),
    );
    expect(decision.fraudScore).toBe(0);
  });
});

describe("FRAUD_002 — High-Value Language (+15)", () => {
  it("adds 15 to fraudScore when highValueLanguage is true", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { highValueLanguage: true } }),
      rules,
    );
    expect(decision.fraudScore).toBe(15);
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_002");
  });

  it("does not trigger when highValueLanguage is false", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { highValueLanguage: false } }),
      rules,
    );
    expect(decision.fraudScore).toBe(0);
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_002");
  });
});

describe("FRAUD_003 — Cross-Signal Conflicts (+20 per, max +40)", () => {
  const cases: Array<{ conflicts: number; expectedScore: number }> = [
    { conflicts: 0, expectedScore: 0  },
    { conflicts: 1, expectedScore: 20 },
    { conflicts: 2, expectedScore: 40 },
    { conflicts: 3, expectedScore: 40 }, // capped at 40
    { conflicts: 5, expectedScore: 40 }, // capped at 40
  ];

  for (const { conflicts, expectedScore } of cases) {
    it(`${conflicts} conflict(s) → +${expectedScore}`, () => {
      const crossSignalConflicts = Array.from({ length: conflicts }, (_, i) => `conflict ${i + 1}`);
      const decision = runPolicyEngine(
        makeInput(),
        makeSignals({ consistency: { crossSignalConflicts } }),
        rules,
      );
      expect(decision.fraudScore).toBe(expectedScore);
      if (conflicts > 0) {
        expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_003");
      } else {
        expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_003");
      }
    });
  }
});

describe("FRAUD_004 — Photo Does Not Match Description (+30)", () => {
  it("adds 30 when photoMatchesDescription is false and visual not skipped", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { photoMatchesDescription: false } }),
      rules,
    );
    expect(decision.fraudScore).toBe(30);
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_004");
  });

  it("does not trigger when photoMatchesDescription is true", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { photoMatchesDescription: true } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_004");
  });

  it("does not trigger when photoMatchesDescription is null (skipped)", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { photoMatchesDescription: null } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_004");
  });

  it("does not trigger when visual is skipped", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { skipped: true, photoMatchesDescription: false } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_004");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { photoMatchesDescription: false } }),
      makeRetailerRules({ disabledRules: ["FRAUD_004"] }),
    );
    expect(decision.fraudScore).toBe(0);
  });
});

describe("FRAUD_005 — Suspicious Visual Elements (+20)", () => {
  it("adds 20 when suspiciousElements is non-empty and visual not skipped", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { suspiciousElements: ["staged background", "mismatched lighting"] } }),
      rules,
    );
    expect(decision.fraudScore).toBe(20);
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("FRAUD_005");
  });

  it("does not trigger when suspiciousElements is empty", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { suspiciousElements: [] } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_005");
  });

  it("does not trigger when visual is skipped", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { skipped: true, suspiciousElements: ["suspicious thing"] } }),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("FRAUD_005");
  });
});

describe("Fraud score → outcome thresholds", () => {
  it("fraudScore < 30 → approve", () => {
    // FRAUD_002 only = +15
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ text: { highValueLanguage: true } }),
      rules,
    );
    expect(decision.fraudScore).toBe(15);
    expect(decision.outcome).toBe("approve");
  });

  it("fraudScore === 30 → approve_flagged (boundary)", () => {
    // FRAUD_002(+15) + FRAUD_005(+20) — wait that's 35. Let me use FRAUD_002(15) + need 15 more.
    // Use FRAUD_001(25) + FRAUD_002(15) = 40... too high.
    // Use just FRAUD_004(30) = exactly 30 → approve_flagged
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({ visual: { photoMatchesDescription: false } }),
      rules,
    );
    expect(decision.fraudScore).toBe(30);
    expect(decision.outcome).toBe("approve_flagged");
  });

  it("fraudScore in 30–59 → approve_flagged", () => {
    // FRAUD_001(+25) + FRAUD_002(+15) = 40
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({
        text: { timelineAnomaly: true, highValueLanguage: true },
      }),
      rules,
    );
    expect(decision.fraudScore).toBe(40);
    expect(decision.outcome).toBe("approve_flagged");
  });

  it("fraudScore === 60 → reject (boundary)", () => {
    // FRAUD_001(+25) + FRAUD_004(+30) = 55... not 60
    // FRAUD_001(+25) + FRAUD_005(+20) + FRAUD_002(+15) = 60 exactly
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({
        text:   { timelineAnomaly: true, highValueLanguage: true },
        visual: { suspiciousElements: ["staged"], photoMatchesDescription: true },
      }),
      rules,
    );
    expect(decision.fraudScore).toBe(60);
    expect(decision.outcome).toBe("reject");
  });

  it("fraudScore > 60 → reject", () => {
    // All five FRAUD rules: FRAUD_001(25) + FRAUD_002(15) + FRAUD_003(40, capped) + FRAUD_004(30) + FRAUD_005(20) = 130
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({
        text:        { timelineAnomaly: true, highValueLanguage: true },
        visual:      { photoMatchesDescription: false, suspiciousElements: ["x"] },
        consistency: { crossSignalConflicts: ["a", "b"] },
      }),
      rules,
    );
    expect(decision.fraudScore).toBeGreaterThan(60);
    expect(decision.outcome).toBe("reject");
  });

  it("fraud rules back-fill outcome with the final decision outcome", () => {
    // fraudScore = 60 → reject; verify all fraud rule entries have outcome = "reject"
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals({
        text:   { timelineAnomaly: true, highValueLanguage: true },
        visual: { suspiciousElements: ["staged"] },
      }),
      rules,
    );
    const fraudRules = decision.triggeredRules.filter((r) => r.severity === "fraud");
    for (const rule of fraudRules) {
      expect(rule.outcome).toBe(decision.outcome);
    }
  });
});
