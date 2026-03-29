import type { NormalizedSignal } from "@/lib/truststack";
import { SignalBadge } from "./SignalBadge";

/**
 * API response shape returned by POST /api/analyze/claim.
 * Mirrors ClaimAnalysisResponse without importing server-only modules.
 */
export type ClaimAnalysisResult = {
  // Identity
  caseId:        string;
  caseRef:       string;
  decisionRunId: string;

  // Decision
  decision:    string;
  explanation: string;
  judgeSource: "claude" | "demo";

  // Risk
  risk_score:  number;
  riskLevel?:  string;

  // Actions
  actions: Array<{
    action:        string;
    status:        string;
    targetSystem?: string;
    auditMessage:  string;
  }>;

  // Evidence
  signals: Array<{
    key:            string;
    value:          string;
    confidence:     number;
    flag:           "risk" | "neutral" | "clean";
    weight:         "high" | "medium" | "low";
    sourceModality: string;
    rationale?:     string;
    // FusedSignal extras — present at runtime when fusion ran
    reinforced?:      boolean;
    corroboratedBy?:  string[];
    contradictedBy?:  string[];
    fusedFromCount?:  number;
  }>;
  contradictions: Array<{
    signalA:   string;
    signalB:   string;
    modalityA: string;
    modalityB: string;
    severity:  "strong" | "weak";
    description: string;
  }>;
  evidence_summary: Array<{
    artifactId:     string;
    modality:       string;
    signalCount:    number;
    stepStatus:     string;
    skippedReason?: string;
  }>;
  audit_trail: Array<{
    stepId:     string;
    label:      string;
    status:     string;
    durationMs?: number;
    metadata?:  Record<string, unknown>;
  }>;

  // Legacy
  consistencyScore:    number;
  auditTrail:          string[];
  imageAiProbability?: number;
  textAiProbability?:  number;
};

type Props = { result: ClaimAnalysisResult };

// ── Config maps ───────────────────────────────────────────────────────────────

const decisionConfig: Record<string, { label: string; bar: string; badge: string }> = {
  approve: {
    label: "Approved",
    bar:   "bg-emerald-500",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  flag: {
    label: "Flagged — Manual Review",
    bar:   "bg-amber-400",
    badge: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  review: {
    label: "Escalated — Human Review",
    bar:   "bg-amber-400",
    badge: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  request_more_evidence: {
    label: "More Evidence Required",
    bar:   "bg-sky-400",
    badge: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  },
  reject: {
    label: "Rejected",
    bar:   "bg-red-500",
    badge: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

const riskLevelLabel: Record<string, string> = {
  low:      "Low risk",
  medium:   "Medium risk",
  high:     "High risk",
  critical: "Critical risk",
};

const modalityLabel: Record<string, string> = {
  image:    "Image",
  text:     "Text",
  document: "Document",
  metadata: "Metadata",
};

const modalityColors: Record<string, string> = {
  image:    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-400",
  text:     "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-400",
  document: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400",
  metadata: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400",
};

const actionColors: Record<string, string> = {
  auto_refund:           "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-400",
  request_more_evidence: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-400",
  send_to_human_review:  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400",
  block_and_flag:        "border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400",
  generate_evidence_pack:"border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/30 dark:text-purple-400",
  auto_reject:           "border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400",
};

const actionLabel: Record<string, string> = {
  auto_refund:            "Auto Refund",
  request_more_evidence:  "Request Evidence",
  send_to_human_review:   "Human Review",
  block_and_flag:         "Block & Flag",
  generate_evidence_pack: "Evidence Pack",
  auto_reject:            "Auto Reject",
};

const strengthColors: Record<string, string> = {
  strong:       "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-400",
  moderate:     "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-400",
  weak:         "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-400",
  insufficient: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500",
};

const stepStatusDot: Record<string, string> = {
  completed: "text-emerald-500",
  skipped:   "text-zinc-400",
  failed:    "text-red-500",
  pending:   "text-zinc-400",
  running:   "text-teal-500",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DecisionPanel({ result }: Props) {
  const cfg          = decisionConfig[result.decision] ?? decisionConfig.flag;
  const riskPct      = Math.round(result.risk_score * 100);
  const consistPct   = Math.round(result.consistencyScore * 100);

  // Extract evidence strength from fusion step metadata
  const fusionStep       = result.audit_trail.find((s) => s.stepId === "fusion");
  const evidenceStrength = fusionStep?.metadata?.evidenceStrength as string | undefined;

  return (
    <div className="space-y-5">

      {/* ── Decision badge ────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border px-5 py-4 ${cfg.badge}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest opacity-70">Decision</p>
          {result.riskLevel ? (
            <span className="text-xs font-medium opacity-70">
              {riskLevelLabel[result.riskLevel] ?? result.riskLevel}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xl font-semibold">{cfg.label}</p>
        {result.caseRef ? (
          <p className="mt-1 font-mono text-xs opacity-60">{result.caseRef}</p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed opacity-90">{result.explanation}</p>
      </div>

      {/* ── Risk score + evidence strength row ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {riskPct}%
          </span>
          <span className="mt-1 text-center text-xs text-zinc-500">Risk score</span>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${cfg.bar}`}
              style={{ width: `${riskPct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {consistPct}%
          </span>
          <span className="mt-1 text-center text-xs text-zinc-500">Consistency</span>
          {evidenceStrength ? (
            <span className={`mt-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${strengthColors[evidenceStrength] ?? strengthColors.insufficient}`}>
              {evidenceStrength}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Evidence by modality ─────────────────────────────────────────── */}
      {result.evidence_summary.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Evidence bundle
          </p>
          <div className="flex flex-wrap gap-2">
            {result.evidence_summary.map((e) => (
              <div
                key={e.artifactId}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${modalityColors[e.modality] ?? modalityColors.metadata}`}
              >
                <span className="font-medium">{modalityLabel[e.modality] ?? e.modality}</span>
                {e.stepStatus === "completed" ? (
                  <span className="opacity-70">{e.signalCount} signal{e.signalCount !== 1 ? "s" : ""}</span>
                ) : e.stepStatus === "skipped" ? (
                  <span className="opacity-50">skipped</span>
                ) : e.stepStatus === "failed" ? (
                  <span className="text-red-500 opacity-80">failed</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Contradictions ───────────────────────────────────────────────── */}
      {result.contradictions.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Cross-modal contradictions
          </p>
          <div className="space-y-2">
            {result.contradictions.map((c, i) => (
              <div key={i} className="text-xs text-amber-800 dark:text-amber-300">
                <span className={`mr-1.5 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  c.severity === "strong"
                    ? "border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                    : "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                }`}>
                  {c.severity}
                </span>
                {c.description}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      {result.actions.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Actions
          </p>
          <div className="space-y-2">
            {result.actions.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${actionColors[a.action] ?? "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"}`}
              >
                <span className="shrink-0 text-xs font-semibold">
                  {actionLabel[a.action] ?? a.action}
                </span>
                <span className="text-xs opacity-75">{a.auditMessage}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Signals ─────────────────────────────────────────────────────── */}
      {result.signals.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Fused signals
          </p>
          <div className="space-y-2">
            {result.signals.map((s) => (
              <div key={s.key} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SignalBadge signal={s as NormalizedSignal} />
                </div>
                {s.reinforced ? (
                  <span className="mt-0.5 shrink-0 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-400">
                    reinforced
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Policy audit trail ──────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Policy audit trail
        </p>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          {result.auditTrail.length > 0 ? (
            <ul className="space-y-1.5">
              {result.auditTrail.map((entry, i) => (
                <li key={i} className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {entry}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-xs text-zinc-400">No rules triggered — default approve.</p>
          )}
        </div>
        <p className="mt-1.5 text-right text-xs text-zinc-400">
          Judge:{" "}
          {result.judgeSource === "claude"
            ? "Claude (claude-haiku-4-5)"
            : "Template — add ANTHROPIC_API_KEY for LLM reasoning"}
        </p>
      </div>

      {/* ── Orchestration log (collapsible) ─────────────────────────────── */}
      {result.audit_trail.length > 0 ? (
        <details className="rounded-2xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            Orchestration log ({result.audit_trail.length} steps)
          </summary>
          <div className="space-y-1 px-4 pb-3 pt-1">
            {result.audit_trail.map((step) => (
              <div key={step.stepId} className="flex items-baseline gap-2 py-0.5">
                <span className={`shrink-0 text-xs ${stepStatusDot[step.status] ?? "text-zinc-400"}`}>
                  {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : step.status === "skipped" ? "–" : "·"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                  {step.label}
                </span>
                {step.durationMs != null ? (
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                    {step.durationMs}ms
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

    </div>
  );
}
