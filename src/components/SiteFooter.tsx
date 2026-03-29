export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200/80 py-8 dark:border-zinc-800/80">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between sm:px-6">
        <span className="text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">TrustStack</span>
        <p className="max-w-md text-center text-xs leading-relaxed text-zinc-500 sm:text-left">
          TrustStack scores are probabilistic and intended as a decision aid — not legal or forensic proof.
          Always combine with human judgement for high-stakes cases.
        </p>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          &copy; {new Date().getFullYear()} TrustStack
        </span>
      </div>
    </footer>
  );
}
