/**
 * JudgeAgent
 *
 * Synthesises a RiskAssessment and PolicyDecision into a human-readable
 * explanation using an LLM (Claude Haiku). Falls back to a deterministic
 * template when ANTHROPIC_API_KEY is absent.
 *
 * The judge populates PolicyDecision.explanation and DecisionRun.justification.
 * It is advisory — it never changes the decision outcome.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Agent } from "./index";
import type { RiskAssessment } from "../types/risk";
import type { PolicyDecision, PolicyConfig } from "../types/policy";
import type { NormalizedSignal } from "../types/signal";

export type JudgeInput = {
  claimDescription: string;
  risk: RiskAssessment;
  decision: PolicyDecision;
  config?: Pick<PolicyConfig, "customPolicyNotes">;
  /**
   * Present on iteration 2+. Lets the judge acknowledge what changed between
   * the previous pass and the current one.
   */
  previousDecision?: {
    outcome:      string;
    explanation:  string;
    iteration:    number;
  };
};

export type JudgeOutput = {
  justification: string;
  judgeSource: "claude" | "demo";
};

export class JudgeAgent implements Agent<JudgeInput, JudgeOutput> {
  readonly agentId = "judge-agent";
  readonly version = "1.0.0";

  async run(input: JudgeInput): Promise<JudgeOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return {
        justification: buildTemplate(input.decision.outcome, input.risk, input.previousDecision),
        judgeSource: "demo",
      };
    }

    const { claimDescription, risk, decision, config, previousDecision } = input;

    const signalSummary = risk.signals
      .map((s: NormalizedSignal) => {
        const scorePart =
          s.rawScore !== undefined
            ? ` (score: ${Math.round(s.rawScore * 100)}%, confidence: ${Math.round(s.confidence * 100)}%)`
            : "";
        return `- [${s.flag.toUpperCase()}] ${s.key}: ${s.value}${scorePart}${s.rationale ? " — " + s.rationale : ""}`;
      })
      .join("\n");

    const triggeredRules = decision.matchedRules
      .filter((r) => r.triggered)
      .map((r) => `- ${r.ruleName}: ${r.detail}`)
      .join("\n");

    const customSection = config?.customPolicyNotes?.trim()
      ? `\nMERCHANT POLICY NOTES:\n${config.customPolicyNotes.trim()}\n`
      : "";

    const previousSection = previousDecision
      ? `\nPREVIOUS ANALYSIS (iteration ${previousDecision.iteration}):\nOutcome: ${previousDecision.outcome.toUpperCase()}\nExplanation: ${previousDecision.explanation.slice(0, 400)}\n\nThe claimant has since submitted additional evidence. Acknowledge what changed if the current decision differs.\n`
      : "";

    const prompt = `You are TrustStack's claim adjudication AI. Produce a clear, professional 2–3 sentence justification for the decision below. Be concise and factual — no filler phrases. Reference the specific signals that drove the decision.

CLAIM:
"${claimDescription.slice(0, 600)}"

NORMALIZED SIGNALS:
${signalSummary}

TRIGGERED POLICY RULES:
${triggeredRules || "(none — default approve)"}
${customSection}${previousSection}
DECISION: ${decision.outcome.toUpperCase()}
RISK LEVEL: ${risk.riskLevel.toUpperCase()}
CONSISTENCY SCORE: ${Math.round(risk.consistencyScore * 100)}%

Write the justification now (2–3 sentences, no headers, no bullet points):`;

    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const content = message.content[0];
      const text = content.type === "text" ? content.text.trim() : "";
      if (!text) {
        return {
          justification: buildTemplate(decision.outcome, risk, previousDecision),
          judgeSource: "demo",
        };
      }
      return { justification: text, judgeSource: "claude" };
    } catch {
      return {
        justification: buildTemplate(decision.outcome, risk, previousDecision),
        judgeSource: "demo",
      };
    }
  }
}

function buildTemplate(
  outcome: PolicyDecision["outcome"],
  risk:    RiskAssessment,
  previousDecision?: JudgeInput["previousDecision"],
): string {
  const riskSignals = risk.signals.filter((s) => s.flag === "risk");
  const riskNames   = riskSignals.map((s) => s.key.replace(/_/g, " ")).join(", ");
  const score       = Math.round(risk.consistencyScore * 100);

  if (outcome === "reject") {
    return `This claim has been rejected due to a risk score of ${score}% and critical risk signals in: ${riskNames || "image authenticity and claim data"}. The evidence provided does not meet the minimum standard for approval under current policy.`;
  }
  if (outcome === "review" || outcome === "flag") {
    return `This claim has been escalated for manual review. Risk signals were detected in: ${riskNames || "one or more analysis layers"}. A human agent should verify the evidence before proceeding with any payout.`;
  }
  if (outcome === "request_more_evidence") {
    const iterNote = previousDecision
      ? ` This is a re-analysis (pass ${previousDecision.iteration + 1}); the prior decision was "${previousDecision.outcome}".`
      : "";
    return `Additional evidence is required before this claim can be processed. Contradictions or gaps were detected in the submitted evidence: ${riskNames || "evidence quality is insufficient"}. Please provide supporting documentation.${iterNote}`;
  }
  if (previousDecision && previousDecision.outcome !== outcome) {
    return `Following the submission of additional evidence, the decision has changed from "${previousDecision.outcome}" to "${outcome}" (risk score: ${score}%). The updated signals are now consistent with the new determination.`;
  }
  return `No policy violations or significant risk signals were detected (risk score: ${score}%). The claim appears consistent with the evidence provided and may be approved subject to standard processing checks.`;
}

export const judgeAgent = new JudgeAgent();
