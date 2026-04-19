"use client";

import { useState } from "react";
import type { GuardianAuditRecord } from "@/lib/guardian/types";

interface Props {
  result: GuardianAuditRecord;
  onUsePrompt?: (prompt: string) => void;
}

function SuggestionItem({
  prompt,
  onUsePrompt,
}: {
  prompt: string;
  onUsePrompt?: (p: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/guardian/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json() as { dataUrl?: string; error?: string };
      if (!res.ok) setGenError(json.error ?? "Generation failed.");
      else setImageUrl(json.dataUrl ?? null);
    } catch {
      setGenError("Network error — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">{prompt}</p>
        <div className="flex shrink-0 gap-1.5">
          {onUsePrompt && (
            <button
              type="button"
              onClick={() => onUsePrompt(prompt)}
              className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Use
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {generating ? "…" : imageUrl ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>
      {imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={imageUrl} alt="Generated" className="w-full rounded-b-lg" />
      )}
      {genError && (
        <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{genError}</p>
      )}
    </li>
  );
}

function SuggestionList({
  suggestions,
  onUsePrompt,
}: {
  suggestions: string[];
  onUsePrompt?: (p: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        IP-free alternatives — click Generate to preview
      </p>
      <ul className="mt-2 space-y-2">
        {suggestions.map((prompt, i) => (
          <SuggestionItem key={i} prompt={prompt} onUsePrompt={onUsePrompt} />
        ))}
      </ul>
    </div>
  );
}

const VERDICT_CONFIG = {
  approved: {
    label: "Approved",
    bg: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
    badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    dot: "bg-green-500",
  },
  blocked: {
    label: "Blocked",
    bg: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
    badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    dot: "bg-red-500",
  },
  review: {
    label: "Needs Review",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    dot: "bg-amber-500",
  },
};

export function ResultCard({ result, onUsePrompt }: Props) {
  const config = VERDICT_CONFIG[result.finalVerdict];
  const suggestions = result.decisionOutput.suggestedPrompts ?? [];
  const isBlocked = result.finalVerdict === "blocked" || result.finalVerdict === "review";

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const effectivePrompt = result.repairedPrompt ?? result.originalPrompt ?? "";

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/guardian/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effectivePrompt }),
      });
      const json = await res.json() as { dataUrl?: string; error?: string };
      if (!res.ok) {
        setGenError(json.error ?? "Image generation failed.");
      } else {
        setImageUrl(json.dataUrl ?? null);
      }
    } catch {
      setGenError("Network error — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={`rounded-xl border-2 p-6 ${config.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${config.dot}`} />
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${config.badge}`}>
            {config.label}
          </span>
        </div>
        <span className="text-xs text-zinc-400">{result.durationMs}ms</span>
      </div>

      {/* Safe to publish */}
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Safe to publish:</span>{" "}
        {result.safeToPublish ? "Yes" : "No"}
      </p>

      {/* IP / reasoning explanation */}
      <div className={`mt-3 rounded-lg px-4 py-3 ${isBlocked ? "bg-red-100/60 dark:bg-red-900/20" : "bg-white/60 dark:bg-zinc-900/40"}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {isBlocked ? "Why this was blocked" : "Assessment"}
        </p>
        <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
          {result.decisionOutput.reasoning}
        </p>
      </div>

      {/* Recommended action */}
      <div className="mt-3 rounded-lg bg-white/60 px-4 py-3 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Recommended action
        </p>
        <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
          {result.decisionOutput.recommendedAction}
        </p>
      </div>

      {/* Generate image — approved only */}
      {!isBlocked && effectivePrompt && (
        <div className="mt-4">
          {!imageUrl ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? "Generating image…" : "Generate image"}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Generated image
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Generated image"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {generating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          )}
          {genError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{genError}</p>
          )}
        </div>
      )}

      {/* Suggested free-to-use prompts */}
      {isBlocked && suggestions.length > 0 && (
        <SuggestionList suggestions={suggestions} onUsePrompt={onUsePrompt} />
      )}

      {/* Prompt repair diff */}
      {result.promptWasRepaired && result.repairedPrompt && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Prompt repaired
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-red-100 px-3 py-2 dark:bg-red-900/30">
              <p className="text-xs font-medium text-red-700 dark:text-red-300">Original</p>
              <p className="mt-1 text-xs text-red-800 dark:text-red-200">{result.originalPrompt}</p>
            </div>
            <div className="rounded-lg bg-green-100 px-3 py-2 dark:bg-green-900/30">
              <p className="text-xs font-medium text-green-700 dark:text-green-300">Repaired</p>
              <p className="mt-1 text-xs text-green-800 dark:text-green-200">{result.repairedPrompt}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
