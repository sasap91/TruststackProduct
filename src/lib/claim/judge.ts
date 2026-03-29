import Anthropic from "@anthropic-ai/sdk";
import type { ClaimMetadata, PolicyDecision, Signal } from "@/lib/detection/types";

/**
 * LLM Judge: synthesises normalized signals and the policy audit trail into
 * a human-readable justification for the case decision.
 *
 * Raw detection scores are not accepted — scores are read from Signal.score
 * where needed so that this layer stays signal-first.
 */
export async function generateJustification(
  claimText: string,
  consistencyScore: number,
  signals: Signal[],
  decision: PolicyDecision,
  auditTrail: string[],
  _meta: ClaimMetadata,
  customPolicyNotes?: string,
): Promise<{ justification: string; judgeSource: "claude" | "demo" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      justification: buildDemoJustification(decision, signals, consistencyScore),
      judgeSource: "demo",
    };
  }

  const client = new Anthropic({ apiKey });

  const signalSummary = signals
    .map((s) => {
      const scorePart = s.score !== undefined ? ` (score: ${Math.round(s.score * 100)}%)` : "";
      return `- [${s.flag.toUpperCase()}] ${s.name}: ${s.value}${scorePart}${s.detail ? " — " + s.detail : ""}`;
    })
    .join("\n");

  const policyRules = auditTrail.join("\n");
  const customSection = customPolicyNotes?.trim()
    ? `\nMERCHANT POLICY NOTES:\n${customPolicyNotes.trim()}\n`
    : "";

  const prompt = `You are TrustStack's claim adjudication AI. Produce a clear, professional 2–3 sentence justification for the decision below. Be concise and factual — no filler phrases. Factor in merchant policy notes if provided.

CLAIM TEXT:
"${claimText.slice(0, 600)}"

NORMALIZED SIGNALS:
${signalSummary}

POLICY AUDIT TRAIL:
${policyRules}
${customSection}
DECISION: ${decision.toUpperCase()}
OVERALL INCONSISTENCY SCORE: ${Math.round(consistencyScore * 100)}%

Write the justification now (2–3 sentences, no headers, no bullet points):`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    const text = content.type === "text" ? content.text.trim() : "";
    if (!text) {
      return {
        justification: buildDemoJustification(decision, signals, consistencyScore),
        judgeSource: "demo",
      };
    }
    return { justification: text, judgeSource: "claude" };
  } catch {
    return {
      justification: buildDemoJustification(decision, signals, consistencyScore),
      judgeSource: "demo",
    };
  }
}

function buildDemoJustification(
  decision: PolicyDecision,
  signals: Signal[],
  consistencyScore: number,
): string {
  const riskSignals = signals.filter((s) => s.flag === "risk");
  const riskNames = riskSignals.map((s) => s.name.toLowerCase()).join(", ");

  if (decision === "reject") {
    return `This claim has been rejected due to a high inconsistency score of ${Math.round(consistencyScore * 100)}% and critical risk signals in: ${riskNames || "image authenticity and claim data"}. The evidence provided does not meet the minimum standard for approval under current policy.`;
  }
  if (decision === "flag") {
    return `This claim has been flagged for manual review. Risk signals were detected in: ${riskNames || "one or more analysis layers"}. A human agent should verify the evidence before proceeding with any payout.`;
  }
  return `No policy violations or significant risk signals were detected. The claim appears consistent with the evidence provided and may be approved subject to standard processing checks.`;
}
