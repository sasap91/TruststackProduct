import { describe, it, expect } from "vitest";
import { runPolicyEngine } from "@/lib/truststack/pipeline/policy-engine";
import { makeInput, makeSignals, makeRetailerRules } from "./helpers";

const rules = makeRetailerRules({ returnWindowDays: 30, policyValueThresholdMinorUnits: 20000 });

describe("POLICY_001 — Return Window Advisory", () => {
  const cases: Array<{ daysSince: number; shouldTrigger: boolean; label: string }> = [
    { daysSince: 0,  shouldTrigger: false, label: "day 0 — no advisory" },
    { daysSince: 7,  shouldTrigger: false, label: "day 7 — no advisory" },
    { daysSince: 14, shouldTrigger: false, label: "day 14 — boundary, no trigger" },
    { daysSince: 15, shouldTrigger: true,  label: "day 15 — first day in advisory window" },
    { daysSince: 20, shouldTrigger: true,  label: "day 20 — in advisory window" },
    { daysSince: 29, shouldTrigger: true,  label: "day 29 — last advisory day" },
    { daysSince: 30, shouldTrigger: true,  label: "day 30 — at return window boundary" },
    { daysSince: 31, shouldTrigger: false, label: "day 31 — ELIG_001 fires instead" },
  ];

  for (const { daysSince, shouldTrigger, label } of cases) {
    it(label, () => {
      const orderDate = new Date("2026-02-01");
      const claimDate = new Date(orderDate);
      claimDate.setDate(claimDate.getDate() + daysSince);

      const decision = runPolicyEngine(
        makeInput({
          orderDate: orderDate.toISOString().slice(0, 10),
          claimDate: claimDate.toISOString().slice(0, 10),
        }),
        makeSignals(),
        rules,
      );
      const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(ruleIds).toContain("POLICY_001");
        expect(decision.requiredActions).toContain("verify_return_window");
      } else {
        expect(ruleIds).not.toContain("POLICY_001");
        expect(decision.requiredActions).not.toContain("verify_return_window");
      }
    });
  }

  it("does not prevent approve outcome when no fraud rules fire", () => {
    const decision = runPolicyEngine(
      makeInput({ orderDate: "2026-02-01", claimDate: "2026-02-20" }), // day 19
      makeSignals(),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("POLICY_001");
    expect(decision.outcome).toBe("approve");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput({ orderDate: "2026-02-01", claimDate: "2026-02-20" }),
      makeSignals(),
      makeRetailerRules({ disabledRules: ["POLICY_001"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("POLICY_001");
    expect(decision.requiredActions).not.toContain("verify_return_window");
  });
});

describe("POLICY_002 — High-Value Claim Advisory", () => {
  const cases: Array<{ value: number; shouldTrigger: boolean }> = [
    { value: 1000,  shouldTrigger: false },
    { value: 19999, shouldTrigger: false },
    { value: 20000, shouldTrigger: false }, // boundary — exactly at threshold, no trigger
    { value: 20001, shouldTrigger: true  },
    { value: 50000, shouldTrigger: true  },
  ];

  for (const { value, shouldTrigger } of cases) {
    it(`orderValue ${value} → should${shouldTrigger ? "" : " not"} trigger`, () => {
      const decision = runPolicyEngine(
        makeInput({ orderValue: value }),
        makeSignals(),
        rules,
      );
      const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(ruleIds).toContain("POLICY_002");
        expect(decision.requiredActions).toContain("escalate_value_review");
      } else {
        expect(ruleIds).not.toContain("POLICY_002");
        expect(decision.requiredActions).not.toContain("escalate_value_review");
      }
    });
  }

  it("uses the retailer's policyValueThresholdMinorUnits", () => {
    const customRules = makeRetailerRules({ policyValueThresholdMinorUnits: 5000 });
    const decision = runPolicyEngine(
      makeInput({ orderValue: 6000 }),
      makeSignals(),
      customRules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("POLICY_002");
  });

  it("does not prevent approve outcome when no fraud rules fire", () => {
    const decision = runPolicyEngine(
      makeInput({ orderValue: 25000 }),
      makeSignals(),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("POLICY_002");
    expect(decision.outcome).toBe("approve");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput({ orderValue: 45000 }),
      makeSignals(),
      makeRetailerRules({ disabledRules: ["POLICY_002"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("POLICY_002");
    expect(decision.requiredActions).not.toContain("escalate_value_review");
  });
});

describe("POLICY_001 + POLICY_002 combined", () => {
  it("both actions are present when both rules fire", () => {
    const decision = runPolicyEngine(
      makeInput({
        orderValue: 25000,
        orderDate: "2026-02-01",
        claimDate: "2026-02-20", // day 19
      }),
      makeSignals(),
      rules,
    );
    expect(decision.requiredActions).toContain("verify_return_window");
    expect(decision.requiredActions).toContain("escalate_value_review");
    expect(decision.outcome).toBe("approve");
  });
});

describe("Clean pass — no rules triggered", () => {
  it("clean claim approves with zero fraud score and no required actions", () => {
    const decision = runPolicyEngine(
      makeInput(),
      makeSignals(),
      rules,
    );
    expect(decision.outcome).toBe("approve");
    expect(decision.fraudScore).toBe(0);
    expect(decision.triggeredRules).toHaveLength(0);
    expect(decision.requiredActions).toHaveLength(0);
  });

  it("decision always has a valid ISO 8601 timestamp", () => {
    const decision = runPolicyEngine(makeInput(), makeSignals(), rules);
    expect(() => new Date(decision.timestamp)).not.toThrow();
    expect(new Date(decision.timestamp).toISOString()).toBe(decision.timestamp);
  });

  it("claimId is propagated to the decision", () => {
    const decision = runPolicyEngine(
      makeInput({ claimId: "specific-id-xyz" }),
      makeSignals(),
      rules,
    );
    expect(decision.claimId).toBe("specific-id-xyz");
  });
});
