// ── Injection types ────────────────────────────────────────────────────────────

export type InjectionAttackType =
  | "direct_override"
  | "fake_mode"
  | "safety_bypass"
  | "output_injection"
  | "persona_hijack"
  | "boundary_manipulation"
  | "nested_injection"
  | "encoded_evasion"
  | "false_approval"
  | "extraction_attempt"
  | "unicode_evasion"
  | "homoglyph_evasion"
  | "unknown";

export interface InjectionScanResult {
  injectionDetected: boolean;
  attackType: InjectionAttackType | null;
  description: string | null;
  matchedText: string | null;
}

// ── Guardian input ─────────────────────────────────────────────────────────────

export type GuardianInputMode = "text_prompt" | "image_upload" | "both";

export interface GuardianInput {
  mode: GuardianInputMode;
  textPrompt?: string;
  imageBase64?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  brandRules?: string[];
}

// ── Pipeline stage outputs ─────────────────────────────────────────────────────

export interface ScreenerOutput {
  verdict: "hard_block" | "soft_violation" | "clean";
  hardViolations: Array<{
    term: string;
    ipHolder: string;
    reason: string;
  }>;
  softViolations: Array<{
    term: string;
    concern: string;
    repairable: boolean;
  }>;
  repairedPrompt: string | null;
  riskScore: number;
  explanation: string;
}

export interface ExtractorOutput {
  ipCharacters: Array<{
    description: string;
    ipHolder: string;
    confidence: number;
  }>;
  realPeople: Array<{
    visualDescription: string;
    confidence: number;
  }>;
  brandLogos: Array<{
    brand: string;
    locationInImage: string;
    confidence: number;
  }>;
  styleMimicry: Array<{
    artistDescription: string;
    confidence: number;
  }>;
  overallRisk: "low" | "medium" | "high" | "critical";
  riskSummary: string;
}

export type GuardianVerdict = "approved" | "blocked" | "review";

export interface DecisionOutput {
  verdict: GuardianVerdict;
  confidence: number;
  rulesFired: Array<{
    ruleId: string;
    ruleName: string;
    triggeredBy: string;
    severity: "hard" | "soft";
  }>;
  violations: Array<{
    type:
      | "ip_character"
      | "real_person"
      | "brand_logo"
      | "style_mimicry"
      | "unsafe_content"
      | "prompt_injection";
    description: string;
    severity: "hard" | "soft";
    confidence: number;
  }>;
  safeToPublish: boolean;
  reasoning: string;
  recommendedAction: string;
  suggestedPrompts?: string[];
}

// ── Audit record (returned from pipeline + stored in DB) ───────────────────────

export interface GuardianAuditRecord {
  requestId: string;
  timestamp: string;
  mode: GuardianInputMode;
  originalPrompt: string | null;

  // Injection fields — populated before any LLM call
  injectionBlocked: boolean;
  injectionAttackType: InjectionAttackType | null;
  injectionDescription: string | null;
  injectionMatchedText: string | null;

  // Compliance fields
  promptWasRepaired: boolean;
  repairedPrompt: string | null;
  repairChanges: string[];
  screenerVerdict: string;
  screenerRiskScore: number;
  extractorOutput: ExtractorOutput | null;
  decisionOutput: DecisionOutput;
  finalVerdict: GuardianVerdict;
  safeToPublish: boolean;
  durationMs: number;
}
