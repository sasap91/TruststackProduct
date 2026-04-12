import { describe, it, expect } from "vitest";
import { runPolicyEngine } from "@/lib/truststack/pipeline/policy-engine";
import { PipelineClaimType } from "@/lib/truststack/types/claim";
import { makeInput, makeSignals, makeRetailerRules } from "./helpers";

describe("ELIG_001 — Return Window Exceeded", () => {
  const rules = makeRetailerRules({ returnWindowDays: 30 });

  const cases: Array<{ daysSince: number; shouldTrigger: boolean }> = [
    { daysSince: 0,   shouldTrigger: false },
    { daysSince: 14,  shouldTrigger: false },
    { daysSince: 29,  shouldTrigger: false },
    { daysSince: 30,  shouldTrigger: false }, // exactly at limit — no trigger
    { daysSince: 31,  shouldTrigger: true  },
    { daysSince: 60,  shouldTrigger: true  },
    { daysSince: 365, shouldTrigger: true  },
  ];

  for (const { daysSince, shouldTrigger } of cases) {
    it(`${daysSince} days since order → should${shouldTrigger ? "" : " not"} trigger`, () => {
      const orderDate = new Date("2026-01-01");
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
      const triggered = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(triggered).toContain("ELIG_001");
        expect(decision.outcome).toBe("reject");
      } else {
        expect(triggered).not.toContain("ELIG_001");
      }
    });
  }

  it("uses the retailer's returnWindowDays, not a hardcoded value", () => {
    const extendedRules = makeRetailerRules({ returnWindowDays: 60 });
    const orderDate = "2026-01-01";
    const claimDate = "2026-02-10"; // 40 days — exceeds 30 but within 60

    const strictDecision = runPolicyEngine(
      makeInput({ orderDate, claimDate }),
      makeSignals(),
      makeRetailerRules({ returnWindowDays: 30 }),
    );
    expect(strictDecision.triggeredRules.map((r) => r.ruleId)).toContain("ELIG_001");

    const lenientDecision = runPolicyEngine(
      makeInput({ orderDate, claimDate }),
      makeSignals(),
      extendedRules,
    );
    expect(lenientDecision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_001");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput({ orderDate: "2026-01-01", claimDate: "2026-04-01" }),
      makeSignals(),
      makeRetailerRules({ disabledRules: ["ELIG_001"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_001");
  });
});

describe("ELIG_002 — Value Limit Exceeded", () => {
  const rules = makeRetailerRules({ maxClaimValueMinorUnits: 50000 });

  const cases: Array<{ value: number; shouldTrigger: boolean }> = [
    { value: 1000,  shouldTrigger: false },
    { value: 49999, shouldTrigger: false },
    { value: 50000, shouldTrigger: false }, // exactly at limit — no trigger
    { value: 50001, shouldTrigger: true  },
    { value: 100000,shouldTrigger: true  },
  ];

  for (const { value, shouldTrigger } of cases) {
    it(`orderValue ${value} → should${shouldTrigger ? "" : " not"} trigger`, () => {
      const decision = runPolicyEngine(
        makeInput({ orderValue: value }),
        makeSignals(),
        rules,
      );
      const triggered = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(triggered).toContain("ELIG_002");
        expect(decision.outcome).toBe("reject");
      } else {
        expect(triggered).not.toContain("ELIG_002");
      }
    });
  }

  it("uses the retailer's maxClaimValueMinorUnits", () => {
    const highValueRules = makeRetailerRules({ maxClaimValueMinorUnits: 200000 });
    const decision = runPolicyEngine(
      makeInput({ orderValue: 75000 }),
      makeSignals(),
      highValueRules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_002");
  });

  it("is skippable via disabledRules", () => {
    const decision = runPolicyEngine(
      makeInput({ orderValue: 999999 }),
      makeSignals(),
      makeRetailerRules({ disabledRules: ["ELIG_002"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_002");
  });
});

describe("ELIG_003 — Classifier Confidence Too Low", () => {
  const rules = makeRetailerRules();

  const cases: Array<{ confidence: number; shouldTrigger: boolean }> = [
    { confidence: 0.0,  shouldTrigger: true  },
    { confidence: 0.20, shouldTrigger: true  },
    { confidence: 0.39, shouldTrigger: true  },
    { confidence: 0.40, shouldTrigger: false }, // boundary — exactly at threshold
    { confidence: 0.41, shouldTrigger: false },
    { confidence: 1.0,  shouldTrigger: false },
  ];

  for (const { confidence, shouldTrigger } of cases) {
    it(`confidence ${confidence} → should${shouldTrigger ? "" : " not"} trigger`, () => {
      const signals = makeSignals();
      signals.classifier = { ...signals.classifier, confidence };

      const decision = runPolicyEngine(makeInput(), signals, rules);
      const triggered = decision.triggeredRules.map((r) => r.ruleId);
      if (shouldTrigger) {
        expect(triggered).toContain("ELIG_003");
        expect(decision.outcome).toBe("reject");
      } else {
        expect(triggered).not.toContain("ELIG_003");
      }
    });
  }

  it("is skippable via disabledRules", () => {
    const signals = makeSignals();
    signals.classifier = { ...signals.classifier, confidence: 0.10 };
    const decision = runPolicyEngine(
      makeInput(),
      signals,
      makeRetailerRules({ disabledRules: ["ELIG_003"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_003");
  });
});

describe("ELIG_004 — Claim Type Mismatch", () => {
  const rules = makeRetailerRules();

  it("triggers when declared type differs from classifier output", () => {
    const signals = makeSignals();
    signals.classifier = { ...signals.classifier, claimType: PipelineClaimType.counterfeit_product };

    const decision = runPolicyEngine(
      makeInput({ declaredClaimType: PipelineClaimType.damaged_in_transit }),
      signals,
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).toContain("ELIG_004");
    expect(decision.outcome).toBe("reject");
  });

  it("does not trigger when declared type matches classifier output", () => {
    const signals = makeSignals();
    signals.classifier = { ...signals.classifier, claimType: PipelineClaimType.damaged_in_transit };

    const decision = runPolicyEngine(
      makeInput({ declaredClaimType: PipelineClaimType.damaged_in_transit }),
      signals,
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_004");
  });

  it("does not trigger when declaredClaimType is absent", () => {
    const decision = runPolicyEngine(
      makeInput({ declaredClaimType: undefined }),
      makeSignals(),
      rules,
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_004");
  });

  it("is skippable via disabledRules", () => {
    const signals = makeSignals();
    signals.classifier = { ...signals.classifier, claimType: PipelineClaimType.chargeback };

    const decision = runPolicyEngine(
      makeInput({ declaredClaimType: PipelineClaimType.never_arrived }),
      signals,
      makeRetailerRules({ disabledRules: ["ELIG_004"] }),
    );
    expect(decision.triggeredRules.map((r) => r.ruleId)).not.toContain("ELIG_004");
  });

  it("multiple ELIG rules can trigger simultaneously", () => {
    const signals = makeSignals();
    signals.classifier = {
      ...signals.classifier,
      confidence: 0.10,
      claimType: PipelineClaimType.chargeback,
    };

    const decision = runPolicyEngine(
      makeInput({
        orderValue: 999999,
        declaredClaimType: PipelineClaimType.never_arrived,
        orderDate: "2025-01-01",
        claimDate: "2026-01-01",
      }),
      signals,
      rules,
    );
    const ruleIds = decision.triggeredRules.map((r) => r.ruleId);
    expect(ruleIds).toContain("ELIG_001");
    expect(ruleIds).toContain("ELIG_002");
    expect(ruleIds).toContain("ELIG_003");
    expect(ruleIds).toContain("ELIG_004");
    expect(decision.outcome).toBe("reject");
  });
});
