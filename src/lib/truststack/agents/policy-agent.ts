/**
 * PolicyAgent
 *
 * Signal-driven rule engine. Consumes only FusedSignals and a RiskAssessment —
 * never raw media, raw scores, or artifact bytes.
 *
 * ── Rule evaluation model ─────────────────────────────────────────────────────
 *
 * Rules are evaluated in ascending priority order (lower number = higher priority).
 *
 * Two rule classes:
 *   OVERRIDE rules — if triggered, immediately determine the outcome and halt.
 *     Use for conditions that are unambiguously decisive (critical fraud, clear approval).
 *
 *   STANDARD rules — all are evaluated. The highest-severity triggered outcome wins.
 *     Outcome severity: reject(4) > review(3) > request_more_evidence(2) > approve(1)
 *
 * Risk-band fast paths (evaluated before any rules):
 *   - riskScore < autoApproveBelow → auto-approve
 *   - riskScore > autoRejectAbove  → auto-reject
 *
 * Policy packs:
 *   The engine ships three named packs that tune thresholds. Custom packs
 *   can override any individual threshold via PolicyConfig.
 *   Built-in packs: "standard" (default) | "strict" | "lenient"
 */

import { randomUUID } from "crypto";
import type { Agent } from "./index";
import type { FusedSignal, SignalFusionResult } from "../types/fusion";
import type { RiskAssessment } from "../types/risk";
import type {
  DecisionOutcome,
  PolicyDecision,
  PolicyRuleMatch,
  PolicyConfig,
} from "../types/policy";
import type { PolicyReasoningProvider } from "../providers/policy-reasoning-provider";

export type PolicyAgentInput = {
  fusedSignals:  FusedSignal[];
  fusionResult:  SignalFusionResult;
  riskAssessment: RiskAssessment;
  config?: PolicyConfig;
  /** Claim narrative for optional PolicyReasoningProvider (never used by base rules) */
  claimDescription?: string;
};

export type PolicyAgentOutput = PolicyDecision;

// ── Outcome severity ordering ─────────────────────────────────────────────────

const OUTCOME_SEVERITY: Record<DecisionOutcome, number> = {
  approve:                1,
  request_more_evidence:  2,
  review:                 3,
  flag:                   3, // legacy alias
  reject:                 4,
};

function maxOutcome(a: DecisionOutcome, b: DecisionOutcome): DecisionOutcome {
  return OUTCOME_SEVERITY[a] >= OUTCOME_SEVERITY[b] ? a : b;
}

// ── Policy pack definitions ───────────────────────────────────────────────────

type PackThresholds = {
  autoApproveBelow:     number;
  autoRejectAbove:      number;
  lateFilingHours:      number;
  highRefundRate:       number;
  requireVideoHighValue: boolean;
};

const PACKS: Record<string, PackThresholds> = {
  standard: {
    autoApproveBelow:     0.10,
    autoRejectAbove:      0.88,
    lateFilingHours:      48,
    highRefundRate:       0.40,
    requireVideoHighValue: true,
  },
  strict: {
    autoApproveBelow:     0.06,
    autoRejectAbove:      0.75,
    lateFilingHours:      24,
    highRefundRate:       0.25,
    requireVideoHighValue: true,
  },
  lenient: {
    autoApproveBelow:     0.18,
    autoRejectAbove:      0.92,
    lateFilingHours:      72,
    highRefundRate:       0.55,
    requireVideoHighValue: false,
  },
};

// ── Rule context ──────────────────────────────────────────────────────────────

type RuleCtx = {
  signals:    FusedSignal[];
  fusion:     SignalFusionResult;
  risk:       RiskAssessment;
  pack:       PackThresholds;
  // helpers
  flag(key: string): FusedSignal["flag"] | undefined;
  conf(key: string): number | undefined;
  score(key: string): number | undefined;
  isRisk(key: string): boolean;
  isClean(key: string): boolean;
  allRisk(...keys: string[]): boolean;
  anyRisk(...keys: string[]): boolean;
};

function buildCtx(
  signals: FusedSignal[],
  fusion: SignalFusionResult,
  risk: RiskAssessment,
  pack: PackThresholds,
): RuleCtx {
  const idx = new Map(signals.map((s) => [s.key, s]));
  const flag  = (key: string) => idx.get(key)?.flag;
  const conf  = (key: string) => idx.get(key)?.confidence;
  const score = (key: string) => idx.get(key)?.rawScore;
  return {
    signals, fusion, risk, pack,
    flag, conf, score,
    isRisk:   (key) => flag(key) === "risk",
    isClean:  (key) => flag(key) === "clean",
    allRisk:  (...keys) => keys.every((k) => flag(k) === "risk"),
    anyRisk:  (...keys) => keys.some((k)  => flag(k) === "risk"),
  };
}

// ── Rule definition ───────────────────────────────────────────────────────────

type PolicyRule = {
  id:        string;
  name:      string;
  priority:  number;
  override:  boolean;  // halts evaluation if triggered
  evidenceKeys: string[];
  condition: (ctx: RuleCtx) => boolean;
  outcome:   DecisionOutcome;
  detail:    (ctx: RuleCtx) => string;
};

// ── Core rule definitions (seeded + extensible) ───────────────────────────────

const BASE_RULES: PolicyRule[] = [

  // ── OVERRIDE: unambiguous fraud — delivered + repeat + no evidence ─────────
  {
    id: "reject_delivered_repeat_no_evidence",
    name: "Delivered + repeat claimant + no supporting evidence",
    priority: 10,
    override: true,
    evidenceKeys: ["delivered_but_claimed_missing", "repeat_claimant", "receipt_present"],
    condition: (ctx) =>
      ctx.isRisk("delivered_but_claimed_missing") &&
      ctx.isRisk("repeat_claimant") &&
      !ctx.isRisk("receipt_present") &&
      !ctx.isClean("receipt_present"),
    outcome: "reject",
    detail: (ctx) => {
      const conf = ctx.conf("delivered_but_claimed_missing") ?? 0;
      return `Carrier confirmed delivery; claimant is flagged as a repeat claimant (${ctx.conf("repeat_claimant") ? Math.round((ctx.conf("repeat_claimant") ?? 0) * 100) + "%" : "n/a"} confidence); no receipt or invoice submitted. Combined fraud indicator confidence: ${Math.round(conf * 100)}%.`;
    },
  },

  // ── OVERRIDE: critical multi-modal fraud pattern ──────────────────────────
  {
    id: "reject_critical_multimodal_fraud",
    name: "Critical risk score + image manipulation + suspicious language",
    priority: 20,
    override: true,
    evidenceKeys: ["possible_image_manipulation", "suspicious_language"],
    condition: (ctx) =>
      ctx.risk.riskLevel === "critical" &&
      ctx.isRisk("possible_image_manipulation") &&
      ctx.isRisk("suspicious_language"),
    outcome: "reject",
    detail: (ctx) =>
      `Risk level is CRITICAL (score: ${Math.round(ctx.risk.consistencyScore * 100)}%). Image manipulation detected (${Math.round((ctx.conf("possible_image_manipulation") ?? 0) * 100)}% confidence) alongside suspicious claim language. Multi-modal fraud pattern confirmed.`,
  },

  // ── OVERRIDE: strong legitimate claim — approve immediately ───────────────
  {
    id: "approve_strong_clean_claim",
    name: "Strong corroborated damage evidence + clean account history",
    priority: 30,
    override: true,
    evidenceKeys: ["visible_damage", "damage_claimed", "high_refund_rate", "late_claim"],
    condition: (ctx) =>
      ctx.isRisk("visible_damage") &&
      ctx.isRisk("damage_claimed") &&
      (ctx.conf("visible_damage") ?? 0) >= 0.70 &&
      (ctx.conf("damage_claimed") ?? 0) >= 0.65 &&
      ctx.isClean("high_refund_rate") &&
      ctx.isClean("late_claim") &&
      !ctx.isRisk("repeat_claimant") &&
      !ctx.isRisk("possible_image_manipulation") &&
      ctx.fusion.contradictions.filter((c) => c.severity === "strong").length === 0,
    outcome: "approve",
    detail: (ctx) => {
      const dConf  = Math.round((ctx.conf("visible_damage")  ?? 0) * 100);
      const tConf  = Math.round((ctx.conf("damage_claimed")  ?? 0) * 100);
      return `Visible damage confirmed by image evidence (${dConf}% confidence) and corroborated by claim text (${tConf}% confidence). Account history is clean — no elevated refund rate, no late filing, no manipulation signals.`;
    },
  },

  // ── STANDARD: strong contradiction → request more evidence ────────────────
  {
    id: "request_evidence_strong_contradiction",
    name: "Strong cross-modal contradiction detected",
    priority: 40,
    override: false,
    evidenceKeys: [],
    condition: (ctx) =>
      ctx.fusion.contradictions.filter((c) => c.severity === "strong").length > 0 &&
      ctx.fusion.evidenceStrength === "insufficient",
    outcome: "request_more_evidence",
    detail: (ctx) => {
      const pair = ctx.fusion.contradictions.find((c) => c.severity === "strong");
      return pair
        ? `Strong cross-modal contradiction between "${pair.signalA}" and "${pair.signalB}" (${pair.modalityA} vs ${pair.modalityB}). Evidence is insufficient to resolve the conflict: ${pair.description}`
        : "Strong contradiction detected with insufficient evidence to resolve.";
    },
  },

  // ── STANDARD: any strong contradiction → review ───────────────────────────
  {
    id: "review_strong_contradiction",
    name: "Strong cross-modal contradiction — requires human review",
    priority: 50,
    override: false,
    evidenceKeys: [],
    condition: (ctx) =>
      ctx.fusion.contradictions.filter((c) => c.severity === "strong").length > 0,
    outcome: "review",
    detail: (ctx) => {
      const pairs = ctx.fusion.contradictions
        .filter((c) => c.severity === "strong")
        .map((c) => `${c.signalA} vs ${c.signalB}`)
        .join("; ");
      return `Strong contradiction(s) between modalities prevent automated resolution: ${pairs}. Human review required.`;
    },
  },

  // ── STANDARD: high refund rate + late claim + weak evidence → reject ──────
  {
    id: "reject_refund_late_weak",
    name: "High refund rate + late claim + weak evidence",
    priority: 60,
    override: false,
    evidenceKeys: ["high_refund_rate", "late_claim"],
    condition: (ctx) =>
      ctx.isRisk("high_refund_rate") &&
      ctx.isRisk("late_claim") &&
      (ctx.fusion.evidenceStrength === "weak" || ctx.fusion.evidenceStrength === "insufficient"),
    outcome: "reject",
    detail: (ctx) => {
      const rr = Math.round((ctx.score("high_refund_rate") ?? 0) * 100);
      const age = ctx.score("late_claim");
      return `Elevated refund rate (${rr}%) combined with late claim filing${age !== undefined ? ` (${age}h)` : ""}. Evidence quality is ${ctx.fusion.evidenceStrength} — insufficient to offset risk indicators.`;
    },
  },

  // ── STANDARD: high refund rate + late claim → review ─────────────────────
  {
    id: "review_refund_late_claim",
    name: "High refund rate + late claim",
    priority: 70,
    override: false,
    evidenceKeys: ["high_refund_rate", "late_claim"],
    condition: (ctx) =>
      ctx.isRisk("high_refund_rate") &&
      ctx.isRisk("late_claim"),
    outcome: "review",
    detail: (ctx) => {
      const rr  = Math.round((ctx.score("high_refund_rate") ?? 0) * 100);
      const age = ctx.score("late_claim");
      return `Refund rate ${rr}% exceeds threshold. Claim filed ${age !== undefined ? `${age}h` : "late"} outside policy window. Both risk indicators present — flagged for human review.`;
    },
  },

  // ── STANDARD: high-value claim without video on high-risk account ─────────
  {
    id: "review_high_value_no_video_risk_account",
    name: "High-value item, no video proof, elevated account risk",
    priority: 80,
    override: false,
    evidenceKeys: ["no_video_proof", "high_value_item", "high_refund_rate"],
    condition: (ctx) =>
      ctx.pack.requireVideoHighValue &&
      ctx.isRisk("no_video_proof") &&  // flag=risk only when high-value=true
      (ctx.isRisk("high_refund_rate") || ctx.isRisk("repeat_claimant")),
    outcome: "review",
    detail: (_ctx) =>
      "High-value item claim submitted without required video evidence. Account risk indicators are elevated — video proof required before automated approval.",
  },

  // ── STANDARD: repeat claimant → review ───────────────────────────────────
  {
    id: "review_repeat_claimant",
    name: "Repeat claimant",
    priority: 90,
    override: false,
    evidenceKeys: ["repeat_claimant"],
    condition: (ctx) => ctx.isRisk("repeat_claimant"),
    outcome: "review",
    detail: (ctx) => {
      const score = ctx.score("repeat_claimant");
      return score !== undefined
        ? `Claimant has filed ${score} claim(s) in the last 30 days, exceeding the threshold for automated processing. Escalated for manual review.`
        : "Claimant is flagged as a repeat claimant. Escalated for manual review.";
    },
  },

  // ── STANDARD: image manipulation alone → review ───────────────────────────
  {
    id: "review_image_manipulation",
    name: "Possible image manipulation",
    priority: 100,
    override: false,
    evidenceKeys: ["possible_image_manipulation"],
    condition: (ctx) => ctx.isRisk("possible_image_manipulation"),
    outcome: "review",
    detail: (ctx) => {
      const conf = Math.round((ctx.conf("possible_image_manipulation") ?? 0) * 100);
      return `Image analysis detected possible manipulation (${conf}% confidence). Evidence authenticity cannot be confirmed automatically.`;
    },
  },

  // ── STANDARD: high risk assessment with no strong positives → review ──────
  {
    id: "review_high_risk_band",
    name: "High or critical risk assessment",
    priority: 110,
    override: false,
    evidenceKeys: [],
    condition: (ctx) =>
      (ctx.risk.riskLevel === "high" || ctx.risk.riskLevel === "critical") &&
      ctx.fusion.evidenceStrength !== "strong",
    outcome: "review",
    detail: (ctx) =>
      `Risk level is ${ctx.risk.riskLevel.toUpperCase()} (score: ${Math.round(ctx.risk.consistencyScore * 100)}%) with ${ctx.fusion.evidenceStrength} supporting evidence. Automated approval not possible.`,
  },

  // ── STANDARD: new account with high-risk signals → review ─────────────────
  {
    id: "review_new_account_risk",
    name: "New account with risk signals",
    priority: 120,
    override: false,
    evidenceKeys: ["new_account"],
    condition: (ctx) =>
      ctx.isRisk("new_account") &&
      (ctx.anyRisk("high_refund_rate", "suspicious_language", "delivered_but_claimed_missing")),
    outcome: "review",
    detail: (ctx) => {
      const days = ctx.score("new_account");
      return `Account is ${days !== undefined ? `${days} days old` : "very new"} and is associated with additional risk signals. New accounts require enhanced scrutiny.`;
    },
  },

];

// ── Pack-specific rule adjustments ────────────────────────────────────────────
// Strict pack: lower the confidence bar on manipulation rule
// Lenient pack: remove the repeat_claimant-alone review trigger
const STRICT_EXTRA_RULES: PolicyRule[] = [
  {
    id: "strict_review_any_manipulation",
    name: "[Strict] Any image manipulation signal → review",
    priority: 95,
    override: false,
    evidenceKeys: ["possible_image_manipulation"],
    condition: (ctx) => (ctx.conf("possible_image_manipulation") ?? 0) >= 0.3,
    outcome: "review",
    detail: (ctx) => {
      const conf = Math.round((ctx.conf("possible_image_manipulation") ?? 0) * 100);
      return `[Strict policy] Image manipulation signal at ${conf}% confidence — strict threshold triggered.`;
    },
  },
];

// ── PolicyAgent ───────────────────────────────────────────────────────────────

export class PolicyAgent implements Agent<PolicyAgentInput, PolicyAgentOutput> {
  readonly agentId = "policy-agent";
  readonly version = "2.0.0";

  constructor(private readonly policyReasoning?: PolicyReasoningProvider) {}

  async run(input: PolicyAgentInput): Promise<PolicyAgentOutput> {
    const { fusedSignals, fusionResult, riskAssessment, config = {} } = input;

    const pack = this.resolvePack(config);
    const ctx  = buildCtx(fusedSignals, fusionResult, riskAssessment, pack);

    // ── Fast path: risk-band auto-routing ────────────────────────────────────
    const riskScore = riskAssessment.consistencyScore;
    if (riskScore <= pack.autoApproveBelow) {
      return this.attachPolicyReasoning(
        this.buildDecision("approve", [], fusedSignals, "approve",
          `Risk score ${Math.round(riskScore * 100)}% is below the auto-approve threshold of ${Math.round(pack.autoApproveBelow * 100)}%. No policy violations detected.`,
        ),
        input,
      );
    }
    if (riskScore >= pack.autoRejectAbove) {
      return this.attachPolicyReasoning(
        this.buildDecision("reject", [], fusedSignals, "auto-reject",
          `Risk score ${Math.round(riskScore * 100)}% exceeds the auto-reject threshold of ${Math.round(pack.autoRejectAbove * 100)}%. Claim automatically rejected.`,
        ),
        input,
      );
    }

    // ── Select rule set for the active policy pack ────────────────────────────
    const packId  = config.policyPackId ?? "standard";
    const rules   = [...BASE_RULES];
    if (packId === "strict") rules.push(...STRICT_EXTRA_RULES);
    if (packId === "lenient") {
      // Remove repeat_claimant-alone review in lenient mode
      const idx = rules.findIndex((r) => r.id === "review_repeat_claimant");
      if (idx !== -1) rules.splice(idx, 1);
    }
    rules.sort((a, b) => a.priority - b.priority);

    // ── Evaluate rules ────────────────────────────────────────────────────────
    const matches: PolicyRuleMatch[] = [];
    let outcome: DecisionOutcome = "approve";
    const evidenceRefs = new Set<string>();
    let overrideTriggered = false;
    let overrideDetail    = "";

    for (const rule of rules) {
      const triggered = rule.condition(ctx);

      matches.push({
        ruleId:      rule.id,
        ruleName:    rule.name,
        triggered,
        inputValues: this.captureInputValues(rule.evidenceKeys, fusedSignals, fusionResult, riskAssessment),
        outcome:     triggered ? rule.outcome : "no_op",
        detail:      triggered ? rule.detail(ctx) : `Rule "${rule.name}" did not trigger.`,
      });

      if (!triggered) continue;

      rule.evidenceKeys.forEach((k) => evidenceRefs.add(k));

      if (rule.override) {
        outcome           = rule.outcome;
        overrideTriggered = true;
        overrideDetail    = rule.detail(ctx);
        break; // halt evaluation
      }

      // Standard rule: accumulate highest severity
      outcome = maxOutcome(outcome, rule.outcome);
    }

    // ── Compute confidence from relevant signal confidences ───────────────────
    const relevantSignals = fusedSignals.filter((s) => evidenceRefs.has(s.key));
    const confidence =
      relevantSignals.length > 0
        ? relevantSignals.reduce((sum, s) => sum + s.confidence, 0) / relevantSignals.length
        : outcome === "approve" ? 0.80 : 0.55;

    const explanation = overrideTriggered
      ? overrideDetail
      : this.buildSummary(outcome, matches.filter((m) => m.triggered), riskAssessment);

    return this.attachPolicyReasoning(
      {
        outcome,
        explanation,
        matchedRules:       matches,
        evidenceReferences: [...evidenceRefs],
        confidence,
        decidedAt:          new Date(),
        policyVersion:      `policy-agent@2.0.0/${packId}`,
      },
      input,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async attachPolicyReasoning(
    decision: PolicyDecision,
    input: PolicyAgentInput,
  ): Promise<PolicyDecision> {
    if (!this.policyReasoning) return decision;

    const pr = await this.policyReasoning.refine({
      outcome: decision.outcome,
      fusedSignals: input.fusedSignals,
      fusionResult: input.fusionResult,
      riskAssessment: input.riskAssessment,
      claimDescription: input.claimDescription,
      config: input.config,
    });

    const hints = pr.nuances ?? [];
    const hasSupplement = Boolean(pr.supplementalSummary?.trim());
    if (!hasSupplement && hints.length === 0 && pr.confidence === 0) {
      return decision;
    }

    let explanation = decision.explanation;
    if (hasSupplement) {
      explanation = `${explanation}\n\n${pr.supplementalSummary!.trim()}`;
    }

    return {
      ...decision,
      explanation,
      policyReasoningMeta: {
        providerId: this.policyReasoning.providerId,
        confidence: pr.confidence,
        hints,
      },
    };
  }

  private resolvePack(config: PolicyConfig): PackThresholds {
    const packId = config.policyPackId ?? "standard";
    const base   = PACKS[packId] ?? PACKS.standard;
    // Allow per-config overrides on top of the pack
    return {
      ...base,
      ...(config.autoApproveBelow    !== undefined && { autoApproveBelow:     config.autoApproveBelow }),
      ...(config.autoRejectAbove     !== undefined && { autoRejectAbove:      config.autoRejectAbove }),
      ...(config.lateFilingHours     !== undefined && { lateFilingHours:      config.lateFilingHours }),
      ...(config.highRefundRateThreshold !== undefined && { highRefundRate:   config.highRefundRateThreshold }),
      ...(config.requireVideoForHighValue !== undefined && { requireVideoHighValue: config.requireVideoForHighValue }),
    };
  }

  private captureInputValues(
    keys: string[],
    signals: FusedSignal[],
    fusion: SignalFusionResult,
    risk: RiskAssessment,
  ): Record<string, unknown> {
    const idx = new Map(signals.map((s) => [s.key, s]));
    const vals: Record<string, unknown> = {
      riskLevel:              risk.riskLevel,
      riskScore:              risk.consistencyScore,
      evidenceStrength:       fusion.evidenceStrength,
      strongContradictions:   fusion.contradictions.filter((c) => c.severity === "strong").length,
    };
    for (const key of keys) {
      const s = idx.get(key);
      if (s) vals[key] = { flag: s.flag, confidence: s.confidence, rawScore: s.rawScore };
    }
    return vals;
  }

  private buildSummary(
    outcome: DecisionOutcome,
    triggeredRules: PolicyRuleMatch[],
    risk: RiskAssessment,
  ): string {
    if (triggeredRules.length === 0) {
      return `No policy rules triggered. Risk score ${Math.round(risk.consistencyScore * 100)}% — claim approved subject to standard processing.`;
    }
    const ruleNames = triggeredRules.map((r) => `"${r.ruleName}"`).join(", ");
    const outcomeLabel: Record<DecisionOutcome, string> = {
      approve:               "Claim approved",
      review:                "Escalated to human review",
      request_more_evidence: "Additional evidence requested",
      reject:                "Claim rejected",
      flag:                  "Claim flagged",
    };
    return `${outcomeLabel[outcome]}. Triggered rule(s): ${ruleNames}. Risk level: ${risk.riskLevel}.`;
  }

  private buildDecision(
    outcome: DecisionOutcome,
    extraRefs: string[],
    _signals: FusedSignal[],
    _source: string,
    explanation: string,
  ): PolicyDecision {
    return {
      outcome,
      explanation,
      matchedRules:       [],
      evidenceReferences: extraRefs,
      confidence:         outcome === "approve" ? 0.85 : 0.90,
      decidedAt:          new Date(),
      policyVersion:      `policy-agent@2.0.0/fast-path`,
    };
  }
}

export const policyAgent = new PolicyAgent();

// ── Factory: build a custom rule (for merchant rule packs) ───────────────────
export function defineRule(rule: PolicyRule): PolicyRule {
  return { ...rule, id: rule.id || randomUUID() };
}
