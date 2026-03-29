/**
 * TextReasoningProvider — claim intent, suspicious language, urgency.
 *
 * Evidence agents map TextReasoningResult → NormalizedSignal[]; swap adapters
 * (local heuristics, hosted LLM, fine-tuned classifier) without changing fusion
 * or policy code.
 *
 * Registered adapters:
 *   - HeuristicTextReasoningProvider  (default — regex / keyword, no network)
 *   - LlmTextReasoningProvider        (future)
 */

// ── Structured output ───────────────────────────────────────────────────────

export type ClaimIntentLabel =
  | "not_received"
  | "damaged_item"
  | "wrong_item"
  | "general_refund"
  | "unclear";

export type UrgencyTier = "low" | "medium" | "high";

export type TextReasoningResult = {
  /** Primary and secondary intent labels (multilabel) */
  intents: {
    primary: ClaimIntentLabel;
    allMatched: ClaimIntentLabel[];
  };
  /** Distinct damage-related terms detected (count used for signal rawScore) */
  damageTermCount: number;
  suspiciousPatternCount: number;
  /** 0–1 urgency score derived from language */
  urgencyScore: number;
  urgencyTier: UrgencyTier;
  /** Provider-wide confidence in this analysis */
  overallConfidence: number;
  notes?: string[];
};

export interface TextReasoningProvider {
  readonly providerId: string;
  analyze(text: string): Promise<TextReasoningResult>;
}

// ── Heuristic implementation (extracted from former inline agent logic) ─────

const INTENT: Record<ClaimIntentLabel, RegExp> = {
  not_received: /\b(not|never|didn.t|did\s+not)\s+(arrive|receive[d]?|get|come|show\s+up|deliver)|package\s+(lost|missing|never)|item\s+never\s+arrived|where\s+is\s+my\s+(order|package)/i,
  damaged_item: /\b(damaged|broken|cracked|shattered|dented|scratched|defective|faulty|bent|torn|chipped|smashed|crushed|snapped|fractured|ruined)\b/i,
  wrong_item: /\b(wrong|incorrect)\s+(item|product|size|color|model|version)|not\s+what\s+I\s+ordered|not\s+as\s+(described|advertised)|received\s+the\s+wrong/i,
  general_refund: /\b(refund|return|money\s+back|reimburs[e]?|credit)\b/i,
  unclear: /^$/u, // never matches — placeholder key for typing only
};

const DAMAGE_TERMS =
  /\b(broken|cracked|damaged|scratched|dented|shattered|defective|faulty|bent|torn|chipped|smashed|crushed|snapped|fractured|ruined|destroyed|unusable|non.functional|not\s+working|stopped\s+working)\b/gi;

const SUSPICIOUS: RegExp[] = [
  /as\s+per\s+(your|the)\s+(policy|terms|conditions|agreement)/i,
  /per\s+my\s+consumer\s+rights/i,
  /I\s+am\s+entitled\s+to/i,
  /I\s+hereby\s+request/i,
  /to\s+whom\s+it\s+may\s+concern/i,
  /I\s+am\s+writing\s+to\s+(formally\s+)?(inform|request|notify)/i,
  /please\s+be\s+advised/i,
  /pursuant\s+to/i,
  /within\s+the\s+stipulated\s+(time|period)/i,
  /I\s+demand\s+a(n)?\s+(immediate|full|complete|prompt)/i,
  /under\s+the\s+(consumer|protection)\s+(protection\s+)?act/i,
  /this\s+(serves|is)\s+as\s+(formal|official|written)\s+notice/i,
];

const URGENCY_HIGH =
  /\b(legal\s+action|lawyer|attorney|sue|lawsuit|chargeback|dispute|fraud|report\s+to|trading\s+standards|better\s+business|small\s+claims)\b/i;
const URGENCY_MEDIUM =
  /\b(immediately|urgent(ly)?|asap|as\s+soon\s+as\s+possible|emergency|time.sensitive|escalate|escalation|unacceptable)\b/i;
const URGENCY_LOW = /\b(soon|quickly|promptly|fast|speedy)\b/i;

export class HeuristicTextReasoningProvider implements TextReasoningProvider {
  readonly providerId = "heuristic-text-reasoning@1.0";

  async analyze(text: string): Promise<TextReasoningResult> {
    const matched: ClaimIntentLabel[] = [];
    for (const [intent, re] of Object.entries(INTENT)) {
      if (intent === "unclear") continue;
      if (re.test(text)) matched.push(intent as ClaimIntentLabel);
    }

    const primary: ClaimIntentLabel = matched[0] ?? "unclear";
    const multi = matched.length > 1;

    const damageMatches = text.match(DAMAGE_TERMS) ?? [];
    const damageTermCount = new Set(damageMatches.map((m) => m.toLowerCase())).size;

    const suspiciousPatternCount = SUSPICIOUS.filter((re) => re.test(text)).length;

    const highCount = (text.match(URGENCY_HIGH) ?? []).length;
    const medCount = (text.match(URGENCY_MEDIUM) ?? []).length;
    const lowCount = (text.match(URGENCY_LOW) ?? []).length;
    const urgencyScore = Math.min(1, highCount * 0.4 + medCount * 0.2 + lowCount * 0.05);
    const urgencyTier: UrgencyTier =
      urgencyScore >= 0.4 ? "high" : urgencyScore >= 0.15 ? "medium" : "low";

    const overallConfidence =
      matched.length === 1 ? 0.85 : matched.length > 1 ? 0.6 : 0.5;

    return {
      intents: {
        primary,
        allMatched: matched.length > 0 ? [...matched] : [],
      },
      damageTermCount,
      suspiciousPatternCount,
      urgencyScore,
      urgencyTier,
      overallConfidence,
      notes: [
        "heuristic-text-reasoning: local pattern library — no external model.",
        ...(multi ? ["Multiple intent patterns matched."] : []),
      ],
    };
  }
}

export const defaultTextReasoningProvider: TextReasoningProvider =
  new HeuristicTextReasoningProvider();
