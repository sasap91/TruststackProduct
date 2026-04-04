import { describe, it, expect, vi, beforeEach } from "vitest";
import { VelocityEvidenceAgent } from "../velocity-evidence-agent";

// Mock the DB-querying repo function so tests don't need a real DB
vi.mock("@/lib/truststack-repo", () => ({
  getVelocitySignals: vi.fn(),
}));

import { getVelocitySignals } from "@/lib/truststack-repo";

const mockVelocity = vi.mocked(getVelocitySignals);

describe("VelocityEvidenceAgent", () => {
  const agent = new VelocityEvidenceAgent();

  const baseInput = {
    artifactId: "case-123-velocity",
    caseId:     "case-123",
    userId:     "user-abc",
  };

  beforeEach(() => vi.clearAllMocks());

  // ── User velocity ───────────────────────────────────────────────────────────

  it("emits very_high_claim_velocity when 7 prior claims by same user", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser:    7,
      claimsLast30DaysByAddress: null,
      claimsLast30DaysByEmail:   null,
    });

    const { signals } = await agent.run(baseInput);
    const keys = signals.map((s) => s.key);

    expect(keys).toContain("very_high_claim_velocity");
    expect(keys).not.toContain("high_claim_velocity"); // only the higher signal
    const sig = signals.find((s) => s.key === "very_high_claim_velocity")!;
    expect(sig.flag).toBe("risk");
    expect(sig.weight).toBe("high");
    expect(sig.confidence).toBeGreaterThan(0.6);
  });

  it("emits very_high_claim_velocity for exactly 6 prior claims", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 6, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run(baseInput);
    expect(signals.map((s) => s.key)).toContain("very_high_claim_velocity");
  });

  it("emits high_claim_velocity for exactly 3 prior claims", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 3, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run(baseInput);
    const keys = signals.map((s) => s.key);
    expect(keys).toContain("high_claim_velocity");
    expect(keys).not.toContain("very_high_claim_velocity");
    const sig = signals.find((s) => s.key === "high_claim_velocity")!;
    expect(sig.flag).toBe("risk");
    expect(sig.weight).toBe("medium");
  });

  it("emits high_claim_velocity for 5 prior claims", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 5, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run(baseInput);
    expect(signals.map((s) => s.key)).toContain("high_claim_velocity");
  });

  it("emits no velocity signal for fewer than 3 prior claims", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 2, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run(baseInput);
    expect(signals.filter((s) => s.key.includes("velocity") || s.key.includes("abuse"))).toHaveLength(0);
  });

  it("emits no signal for 0 prior claims", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 0, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run(baseInput);
    expect(signals).toHaveLength(0);
  });

  // ── Address velocity ────────────────────────────────────────────────────────

  it("emits shared_address_abuse when 3+ claims from same address", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 1, claimsLast30DaysByAddress: 4, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run({ ...baseInput, shippingAddress: "123 main st" });
    const keys = signals.map((s) => s.key);
    expect(keys).toContain("shared_address_abuse");
    const sig = signals.find((s) => s.key === "shared_address_abuse")!;
    expect(sig.flag).toBe("risk");
    expect(sig.weight).toBe("medium");
  });

  it("does not emit shared_address_abuse when address count < 3", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 0, claimsLast30DaysByAddress: 2, claimsLast30DaysByEmail: null,
    });
    const { signals } = await agent.run({ ...baseInput, shippingAddress: "123 main st" });
    expect(signals.map((s) => s.key)).not.toContain("shared_address_abuse");
  });

  // ── Email velocity ──────────────────────────────────────────────────────────

  it("emits email_velocity_abuse when 3+ claims from same email", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 1, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: 3,
    });
    const { signals } = await agent.run({ ...baseInput, email: "fraud@example.com" });
    const keys = signals.map((s) => s.key);
    expect(keys).toContain("email_velocity_abuse");
    const sig = signals.find((s) => s.key === "email_velocity_abuse")!;
    expect(sig.flag).toBe("risk");
    expect(sig.weight).toBe("medium");
  });

  it("does not emit email_velocity_abuse when email count < 3", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 0, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: 1,
    });
    const { signals } = await agent.run({ ...baseInput, email: "legit@example.com" });
    expect(signals.map((s) => s.key)).not.toContain("email_velocity_abuse");
  });

  // ── Combined signals ────────────────────────────────────────────────────────

  it("can emit multiple signals simultaneously (very_high_velocity + address + email)", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 7, claimsLast30DaysByAddress: 5, claimsLast30DaysByEmail: 4,
    });
    const { signals } = await agent.run({
      ...baseInput,
      shippingAddress: "123 main st",
      email:           "fraud@example.com",
    });
    const keys = signals.map((s) => s.key);
    expect(keys).toContain("very_high_claim_velocity");
    expect(keys).toContain("shared_address_abuse");
    expect(keys).toContain("email_velocity_abuse");
    expect(signals).toHaveLength(3);
  });

  // ── ArtifactAnalysis output ────────────────────────────────────────────────

  it("returns correct analysis metadata", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 0, claimsLast30DaysByAddress: null, claimsLast30DaysByEmail: null,
    });
    const { analysis } = await agent.run(baseInput);
    expect(analysis.artifactId).toBe("case-123-velocity");
    expect(analysis.agentId).toBe("velocity-evidence-agent");
    expect(analysis.completedAt).toBeInstanceOf(Date);
  });

  // ── getVelocitySignals called with correct args ────────────────────────────

  it("passes shippingAddress and email through to getVelocitySignals", async () => {
    mockVelocity.mockResolvedValue({
      claimsLast30DaysByUser: 0, claimsLast30DaysByAddress: 0, claimsLast30DaysByEmail: 0,
    });
    await agent.run({ ...baseInput, shippingAddress: "123 elm st", email: "test@test.com" });
    expect(mockVelocity).toHaveBeenCalledWith("case-123", "user-abc", {
      shippingAddress: "123 elm st",
      email:           "test@test.com",
    });
  });
});
