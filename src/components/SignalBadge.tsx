import type { NormalizedSignal } from "@/lib/truststack";

type Props = { signal: NormalizedSignal };

const flagStyles: Record<NormalizedSignal["flag"], string> = {
  risk:    "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
  neutral: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  clean:   "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
};

const dotStyles: Record<NormalizedSignal["flag"], string> = {
  risk:    "bg-red-500",
  neutral: "bg-amber-400",
  clean:   "bg-emerald-500",
};

const weightLabel: Record<NormalizedSignal["weight"], string> = {
  high:   "High",
  medium: "Med",
  low:    "Low",
};

export function SignalBadge({ signal }: Props) {
  const confidencePct = Math.round(signal.confidence * 100);

  return (
    <div className={`rounded-xl border px-4 py-3 ${flagStyles[signal.flag]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`mt-1 h-2 w-2 flex-none rounded-full ${dotStyles[signal.flag]}`} />
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {signal.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{signal.value}</p>
            {signal.rationale ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{signal.rationale}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            {weightLabel[signal.weight]}
          </span>
          <span className="text-[10px] text-zinc-400 tabular-nums">{confidencePct}% conf</span>
        </div>
      </div>
    </div>
  );
}
