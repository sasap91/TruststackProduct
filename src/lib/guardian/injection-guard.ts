import { randomUUID } from "crypto";
import type {
  InjectionScanResult,
  InjectionAttackType,
  GuardianAuditRecord,
  GuardianInputMode,
} from "./types";

function normalise(input: string): string {
  const stripped = input.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
  return stripped.normalize("NFC");
}

const PATTERNS: [RegExp, InjectionAttackType, string][] = [
  // DIRECT_OVERRIDE
  [/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|guidelines?|constraints?)/gi,
    "direct_override", "Attempts to override prior instructions"],
  [/disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi,
    "direct_override", "Attempts to disregard prior instructions"],
  [/forget\s+(everything|all)\s+(you('ve|\s+have)\s+)?(been\s+)?(told|instructed|trained|learned)/gi,
    "direct_override", "Attempts to erase prior context"],

  // FAKE_MODE
  [/you\s+are\s+now\s+in\s+(developer|admin|debug|test|safe|bypass|unrestricted|jailbreak|god|super|maintenance|override)\s+(mode|access|level|state)/gi,
    "fake_mode", "Attempts to activate fake operational mode"],
  [/(developer|admin|debug|test|override)\s+mode\s*(:|=|is\s+)?\s*(active|enabled|on|true)/gi,
    "fake_mode", "Claims fake mode is active"],
  [/(safety|content|filter|compliance|restriction|guardrail|policy)s?\s+(are\s+)?(disabled|turned\s+off|bypassed|removed|lifted|inactive|off)/gi,
    "fake_mode", "Claims safety systems are disabled"],

  // SAFETY_BYPASS
  [/(bypass|skip|omit|ignore)\s+(the\s+)?(compliance|safety|ip|brand|content)\s+(check|scan|analysis|review|screening|filter)/gi,
    "safety_bypass", "Explicitly requests compliance check bypass"],
  [/disable\s+(content\s+)?(filtering|moderation|safety|compliance)/gi,
    "safety_bypass", "Requests disabling of content filters"],

  // OUTPUT_INJECTION
  [/\{[\s\S]*["']verdict["'][\s\S]*["'](approved|blocked|review)["'][\s\S]*\}/gi,
    "output_injection", "Attempts to inject fake compliance verdict JSON"],
  [/\{[\s\S]*["']safe_?to_?publish["'][\s\S]*:\s*(true|false)[\s\S]*\}/gi,
    "output_injection", "Attempts to inject fake safeToPublish value"],
  [/\{[\s\S]*["']decision["'][\s\S]*["'](approved|blocked)["'][\s\S]*\}/gi,
    "output_injection", "Attempts to inject fake decision JSON"],

  // PERSONA_HIJACK
  [/(you\s+are\s+)(dan|jailbreak|uncensored|unrestricted|unfiltered|evil\s+ai|bad\s+ai|shadow\s+ai)/gi,
    "persona_hijack", "Attempts to adopt known jailbreak persona"],
  [/(pretend|act|behave|imagine|roleplay)\s+(you\s+are|as\s+if)\s+(you\s+are\s+)?(not|without|ignoring|bypassing|unrestricted|uncensored)/gi,
    "persona_hijack", "Attempts to roleplay as uncensored AI"],

  // BOUNDARY_MANIPULATION
  [/<\s*\/?\s*(system|instruction|prompt|context|rule|constraint|guideline)\s*>/gi,
    "boundary_manipulation", "Attempts to inject fake system tags"],
  [/\[\s*(SYSTEM|INST|SYS|INSTRUCTION|RULE|OVERRIDE)\s*\]/gi,
    "boundary_manipulation", "Attempts to inject fake system delimiters"],
  [/###\s*(system|instruction|override|bypass|ignore|jailbreak)/gi,
    "boundary_manipulation", "Attempts to inject fake system headers"],

  // NESTED_INJECTION
  [/(follow|use|apply|execute)\s+(the\s+)?(instructions?|rules?|commands?)\s+(in|from|inside)\s+(the\s+)?(image|document|file|description|brief)/gi,
    "nested_injection", "Claims an uploaded file contains override instructions"],
  [/(this|the)\s+(image|document|file|brief)\s+(contains?|has)\s+(instructions?|rules?)\s+(to|for|that)\s+(override|bypass|ignore|disable)/gi,
    "nested_injection", "Claims uploaded content contains override instructions"],

  // ENCODED_EVASION
  [/m[\s\-_.]+i[\s\-_.]+c[\s\-_.]+k[\s\-_.]+e[\s\-_.]+y/gi,
    "encoded_evasion", "Encoded reference to Mickey Mouse"],
  [/s[\s\-_.]+p[\s\-_.]+i[\s\-_.]+d[\s\-_.]+e[\s\-_.]+r/gi,
    "encoded_evasion", "Encoded reference to Spider-Man"],
  [/p[\s\-_.]+i[\s\-_.]+k[\s\-_.]+a[\s\-_.]+c[\s\-_.]+h[\s\-_.]+u/gi,
    "encoded_evasion", "Encoded reference to Pikachu"],

  // FALSE_APPROVAL
  [/(this\s+(content|image|prompt)\s+(has\s+been|is|was)\s+(pre-?approved|cleared|whitelisted|exempt))/gi,
    "false_approval", "Claims content has been pre-approved"],
  [/(skip|bypass|omit|ignore)\s+(the\s+)?(compliance|safety|ip|brand)\s+(check|scan|analysis|review|screening)/gi,
    "false_approval", "Explicitly requests compliance check bypass"],

  // EXTRACTION_ATTEMPT
  [/(repeat|print|output|show|tell\s+me|reveal|expose|display)\s+(your\s+)?(system\s+prompt|instructions?|rules?|guidelines?|constraints?)/gi,
    "extraction_attempt", "Attempts to extract system prompt"],
  [/what\s+(are\s+)?(your|the)\s+(system\s+prompt|instructions?|rules?|guidelines?|constraints?)/gi,
    "extraction_attempt", "Attempts to reveal system configuration"],

  // UNICODE_EVASION (checked on raw input before normalisation)
  [/[\u200B\u200C\u200D\u2060\uFEFF]/g,
    "unicode_evasion", "Contains zero-width or invisible Unicode characters"],

  // HOMOGLYPH_EVASION
  [/[\u0430-\u044F].*[a-zA-Z]|[a-zA-Z].*[\u0430-\u044F]/g,
    "homoglyph_evasion", "Mixes Cyrillic and Latin characters (homoglyph attack)"],
];

export function scanForInjection(input: string): InjectionScanResult {
  const clean = normalise(input);

  for (const [pattern, attackType, description] of PATTERNS) {
    const target = attackType === "unicode_evasion" ? input : clean;
    const match = pattern.exec(target);
    pattern.lastIndex = 0;
    if (match) {
      return {
        injectionDetected: true,
        attackType,
        description,
        matchedText: match[0].slice(0, 120),
      };
    }
  }

  return {
    injectionDetected: false,
    attackType: null,
    description: null,
    matchedText: null,
  };
}

export function buildInjectionBlockRecord(
  scan: InjectionScanResult,
  originalPrompt: string,
  mode: GuardianInputMode = "text_prompt"
): GuardianAuditRecord {
  return {
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    mode,
    originalPrompt,
    injectionBlocked: true,
    injectionAttackType: scan.attackType,
    injectionDescription: scan.description,
    injectionMatchedText: scan.matchedText,
    promptWasRepaired: false,
    repairedPrompt: null,
    repairChanges: [],
    screenerVerdict: "injection_blocked",
    screenerRiskScore: 1.0,
    extractorOutput: null,
    decisionOutput: {
      verdict: "blocked",
      confidence: 1.0,
      rulesFired: [{
        ruleId: "INJ_001",
        ruleName: "Prompt injection defence",
        triggeredBy: scan.matchedText ?? "pattern match",
        severity: "hard",
      }],
      violations: [{
        type: "prompt_injection",
        description: scan.description ?? "Prompt injection attempt detected",
        severity: "hard",
        confidence: 1.0,
      }],
      safeToPublish: false,
      reasoning: `A prompt injection attack was detected and blocked before reaching the compliance engine. Attack type: ${scan.attackType ?? "unknown"}.`,
      recommendedAction: "Do not attempt to manipulate the compliance system. Submit a genuine image generation prompt.",
      suggestedPrompts: [],
    },
    finalVerdict: "blocked",
    safeToPublish: false,
    durationMs: 0,
  };
}
