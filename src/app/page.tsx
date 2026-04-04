import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { DecisionPanel, type ClaimAnalysisResult } from "@/components/DecisionPanel";
import { ContactSection } from "@/components/ContactSection";
import mockDecision from "../../public/mock-decision.json";

const capabilities = [
  {
    title: "Multimodal analysis",
    body: "Review claim text, images, documents, and metadata in one unified workflow — no stitching together separate tools.",
  },
  {
    title: "Signal fusion",
    body: "Detect inconsistencies, weak evidence, and returns fraud risk across multiple inputs to surface a single, reliable risk picture.",
  },
  {
    title: "Policy-driven decisions",
    body: "Approve, review, reject, or request more evidence based on your own business rules — time limits, value thresholds, refund rate caps.",
  },
  {
    title: "Autonomous actions",
    body: "Trigger follow-ups automatically: issue refunds, escalate to agents, flag accounts, or request additional evidence.",
  },
  {
    title: "Auditability",
    body: "Keep a clear, immutable record of every signal, rule, and action behind every decision — ready for disputes or compliance review.",
  },
];

const steps = [
  { n: "01", title: "Create a case", body: "Submit claim details and evidence through the console or API." },
  { n: "02", title: "Analyze evidence", body: "Text, images, documents, and metadata are scored across all dimensions." },
  { n: "03", title: "Apply policy", body: "Your rules generate a decision and a plain-English explanation." },
  { n: "04", title: "Take action", body: "Execute automatically or route to a human reviewer with the full audit trail." },
];

const endpoints = [
  { method: "POST", path: "/api/cases", desc: "Create a new case" },
  { method: "POST", path: "/api/cases/:id/evidence", desc: "Add evidence to a case" },
  { method: "POST", path: "/api/cases/:id/analyze", desc: "Run analysis and policy evaluation" },
  { method: "POST", path: "/api/cases/:id/actions", desc: "Trigger an action on a case" },
  { method: "GET",  path: "/api/cases/:id", desc: "Fetch case details" },
  { method: "GET",  path: "/api/cases/:id/decision", desc: "Fetch decision and audit trail" },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">

        {/* Hero */}
        <section className="py-20 sm:py-28">
          <p className="text-sm font-medium uppercase tracking-widest text-teal-600 dark:text-teal-400">
            Multimodal Integrity Operations for Retailers, DTC Brands, and Marketplaces
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Verify claims. Detect fraud. Automate decisions.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            TrustStack is a policy-driven decision platform for returns, disputes, and claim fraud workflows.
            It turns messy evidence into structured signals, applies your business rules, and recommends
            or executes the right action with a clear audit trail.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400"
            >
              Try the console
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Get in touch
            </a>
          </div>
        </section>

        {/* Core capabilities */}
        <section className="border-t border-zinc-200/80 py-16 dark:border-zinc-800/80">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Core capabilities
          </h2>
          <p className="mt-2 text-sm text-zinc-500">Everything you need to make consistent, defensible returns fraud decisions at scale.</p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <li
                key={c.title}
                className="rounded-2xl border border-zinc-200/80 bg-white/60 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/40"
              >
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="border-t border-zinc-200/80 py-16 dark:border-zinc-800/80">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            How it works
          </h2>
          <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border border-zinc-200/80 bg-white/60 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/40"
              >
                <span className="font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">{s.n}</span>
                <h3 className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* See it in action */}
        <section className="border-t border-zinc-200/80 py-16 dark:border-zinc-800/80">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            See it in action
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            A non-delivery claim analyzed across image, text, and metadata evidence — in under two seconds.
          </p>

          {/* Browser chrome wrapper */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-zinc-200/80 bg-zinc-100/80 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/80">
              <span className="h-3 w-3 rounded-full bg-red-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
              <div className="ml-3 flex-1 rounded-md border border-zinc-200/80 bg-white/80 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-800/80">
                <span className="font-mono text-xs text-zinc-400">app.truststack.com/cases/TS-2025-A3F1</span>
              </div>
            </div>

            {/* Panel content */}
            <div className="max-h-[640px] overflow-y-auto p-6">
              <DecisionPanel result={mockDecision as ClaimAnalysisResult} />
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Every decision comes with a full signal breakdown and audit trail.
          </p>
        </section>

        {/* Solutions */}
        <section className="border-t border-zinc-200/80 py-16 dark:border-zinc-800/80">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Solutions
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">

            {/* Software */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white/60 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/40">
              <span className="text-xs font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400">Software</span>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">TrustStack Console</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                A dedicated console for operations teams to manage cases, review evidence, configure
                policies, and track decisions — no engineering required.
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-flex items-center rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400"
              >
                Open console
              </Link>
            </div>

            {/* API */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white/60 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/40">
              <span className="text-xs font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400">API Endpoints</span>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">REST API</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Wire TrustStack directly into your existing returns or dispute flow with a simple REST API.
              </p>
              <ul className="mt-4 space-y-1.5">
                {endpoints.map((e) => (
                  <li key={e.path} className="flex items-start gap-2 text-xs">
                    <span className={`mt-px shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold ${
                      e.method === "POST"
                        ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}>
                      {e.method}
                    </span>
                    <span>
                      <code className="font-mono text-zinc-800 dark:text-zinc-200">{e.path}</code>
                      <span className="ml-2 text-zinc-500">— {e.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/settings"
                className="mt-6 inline-flex items-center rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Get API key
              </Link>
            </div>
          </div>
        </section>

        {/* Message us */}
        <section id="contact" className="border-t border-zinc-200/80 py-16 dark:border-zinc-800/80">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Message us
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            Interested in TrustStack? Fill in the form and we&apos;ll get back to you shortly.
          </p>
          <div className="mt-8 max-w-2xl">
            <ContactSection />
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
