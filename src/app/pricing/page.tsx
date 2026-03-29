import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const tiers = [
  {
    name: "Starter",
    price: "$0",
    desc: "For teams evaluating claim fraud detection.",
    features: [
      "50 claim analyses / month",
      "3-layer detection (AI + consistency + policy)",
      "Case history & audit trail",
      "Dashboard UI",
    ],
    cta: "Get started",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/mo",
    desc: "For operations teams running live claim workflows.",
    features: [
      "2,000 claim analyses / month",
      "Everything in Starter",
      "API key access for integrations",
      "Claude LLM judge for explanations",
      "AI or Not image detection",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "/sign-up",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Talk to us",
    desc: "Custom volume, SSO, SLA, and data residency.",
    features: [
      "Unlimited analyses",
      "Custom policy rules",
      "Zendesk / Shopify integration",
      "Dedicated models",
      "SLA + audit log export",
    ],
    cta: "Contact us",
    href: "mailto:hello@truststack.ai",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Simple tiers
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-zinc-600 dark:text-zinc-400">
          Stop paying for claims you shouldn't. Catch fraud before it hits your bottom line.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.highlight
                  ? "border-teal-500/60 bg-teal-50/40 shadow-sm dark:border-teal-500/40 dark:bg-teal-950/20"
                  : "border-zinc-200 bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/40"
              }`}
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.desc}</p>
              <p className="mt-6 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {t.price}
                {"period" in t ? (
                  <span className="text-base font-normal text-zinc-500">{t.period}</span>
                ) : null}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-teal-600 dark:text-teal-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={t.href}
                className={`mt-8 block rounded-full py-3 text-center text-sm font-semibold transition-colors ${
                  t.highlight
                    ? "bg-teal-600 text-white hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400"
                    : "border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
