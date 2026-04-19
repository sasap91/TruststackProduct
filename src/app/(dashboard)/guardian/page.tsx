"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PromptInput } from "./components/PromptInput";
import { ResultCard } from "./components/ResultCard";
import { AuditDetail } from "./components/AuditDetail";
import type { GuardianAuditRecord, GuardianInputMode } from "@/lib/guardian/types";

export default function GuardianPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GuardianAuditRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefillPrompt, setPrefillPrompt] = useState<string | undefined>(undefined);

  async function handleSubmit(data: {
    mode: GuardianInputMode;
    textPrompt?: string;
    imageBase64?: string;
    imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
    brandRules?: string[];
  }) {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/guardian/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "An unexpected error occurred.");
      } else {
        setResult(json as GuardianAuditRecord);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleUsePrompt(prompt: string) {
    setPrefillPrompt(prompt);
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Brand &amp; compliance check
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Submit a text prompt or image to check for IP violations, brand safety
            issues, and policy compliance before publishing.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Input panel */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <PromptInput
              onSubmit={handleSubmit}
              loading={loading}
              prefillPrompt={prefillPrompt}
              onPrefillConsumed={() => setPrefillPrompt(undefined)}
            />

            {loading && (
              <div className="mt-6 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Running compliance pipeline…
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Result panel */}
          <div className="space-y-4">
            {result ? (
              <>
                <ResultCard result={result} onUsePrompt={handleUsePrompt} />
                <AuditDetail result={result} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-200 py-16 dark:border-zinc-700">
                <p className="text-sm text-zinc-400">
                  Results will appear here after submission.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
