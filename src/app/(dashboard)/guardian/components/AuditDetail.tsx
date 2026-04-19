"use client";

import { useState } from "react";
import type { GuardianAuditRecord } from "@/lib/guardian/types";

interface Props {
  result: GuardianAuditRecord;
}

const SEVERITY_STYLES: Record<string, string> = {
  hard: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  soft: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

export function AuditDetail({ result }: Props) {
  const [open, setOpen] = useState(false);
  const [extractorOpen, setExtractorOpen] = useState(false);

  if (result.injectionBlocked) return null;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span>Audit trail</span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="divide-y divide-zinc-100 px-5 pb-5 dark:divide-zinc-800">
          {/* Screener summary */}
          <section className="py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Stage 1 — Screener
            </h3>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                Verdict: <strong>{result.screenerVerdict}</strong>
              </span>
              <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                Risk score: <strong>{(result.screenerRiskScore * 100).toFixed(0)}%</strong>
              </span>
            </div>
          </section>

          {/* Violations */}
          {result.decisionOutput.violations.length > 0 && (
            <section className="py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Violations ({result.decisionOutput.violations.length})
              </h3>
              <ul className="space-y-2">
                {result.decisionOutput.violations.map((v, i) => (
                  <li key={i} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {v.type.replace(/_/g, " ")}
                      </span>
                      <div className="flex gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? ""}`}>
                          {v.severity}
                        </span>
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {(v.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{v.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Rules fired */}
          {result.decisionOutput.rulesFired.length > 0 && (
            <section className="py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Rules fired ({result.decisionOutput.rulesFired.length})
              </h3>
              <ul className="space-y-2">
                {result.decisionOutput.rulesFired.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${SEVERITY_STYLES[r.severity] ?? ""}`}>
                      {r.severity}
                    </span>
                    <span className="font-mono">{r.ruleId}</span>
                    <span>·</span>
                    <span>{r.ruleName}</span>
                    <span className="text-zinc-400">triggered by: {r.triggeredBy}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Extractor output (collapsible JSON) */}
          {result.extractorOutput && (
            <section className="py-4">
              <button
                type="button"
                onClick={() => setExtractorOpen((v) => !v)}
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Stage 2 — Extractor output {extractorOpen ? "▲" : "▼"}
              </button>
              {extractorOpen && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
                  {JSON.stringify(result.extractorOutput, null, 2)}
                </pre>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
