"use client";

import type { GuardianAuditRecord } from "@/lib/guardian/types";

const ATTACK_LABELS: Record<string, string> = {
  direct_override: "Direct instruction override",
  fake_mode: "Fake mode activation",
  safety_bypass: "Safety bypass attempt",
  output_injection: "Output injection",
  persona_hijack: "Persona hijack",
  boundary_manipulation: "Boundary manipulation",
  nested_injection: "Nested injection",
  encoded_evasion: "Encoded evasion",
  false_approval: "False approval claim",
  extraction_attempt: "System prompt extraction",
  unicode_evasion: "Unicode evasion",
  homoglyph_evasion: "Homoglyph evasion",
  unknown: "Unknown attack",
};

interface Props {
  result: GuardianAuditRecord;
}

export function InjectionAlert({ result }: Props) {
  if (!result.injectionBlocked) return null;

  const label = result.injectionAttackType
    ? (ATTACK_LABELS[result.injectionAttackType] ?? result.injectionAttackType)
    : "Unknown attack";

  return (
    <div className="rounded-xl border-2 border-red-400 bg-red-50 p-6 dark:border-red-700 dark:bg-red-950">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 dark:bg-red-900 dark:text-red-200">
          Prompt Injection Blocked
        </span>
      </div>

      <div className="mt-4 rounded-lg bg-red-100/60 px-4 py-3 dark:bg-red-900/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Attack type
        </p>
        <p className="mt-1 text-sm font-medium text-red-800 dark:text-red-200">{label}</p>
      </div>

      {result.injectionDescription && (
        <div className="mt-3 rounded-lg bg-white/60 px-4 py-3 dark:bg-zinc-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Why it was blocked
          </p>
          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
            {result.injectionDescription}
          </p>
        </div>
      )}

      {result.injectionMatchedText && (
        <div className="mt-3 rounded-lg bg-white/60 px-4 py-3 dark:bg-zinc-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Matched pattern
          </p>
          <p className="mt-1 font-mono text-xs text-red-700 dark:text-red-300">
            &ldquo;{result.injectionMatchedText}&rdquo;
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        This request was blocked before reaching the compliance engine. Submit a genuine image generation prompt.
      </p>
    </div>
  );
}
