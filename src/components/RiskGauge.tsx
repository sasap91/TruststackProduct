"use client";

type Props = {
  probability: number;
  label: string;
};

export function RiskGauge({ probability, label }: Props) {
  const pct = Math.round(probability * 100);
  const hue = pct < 35 ? 160 : pct < 65 ? 45 : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <span
          className="text-5xl font-semibold tabular-nums tracking-tight"
          style={{ color: `oklch(0.45 0.14 ${hue})` }}
        >
          {pct}%
        </span>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">estimated AI-generated likelihood</p>
      </div>
      <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, oklch(0.55 0.12 160), oklch(0.55 0.14 ${hue}))`,
          }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-400">
        <span>unlikely AI</span>
        <span>likely AI</span>
      </div>
    </div>
  );
}
