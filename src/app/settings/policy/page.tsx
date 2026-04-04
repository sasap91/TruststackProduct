import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PolicyClient } from "./policy-client";

export default function PolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Risk &amp; Policy Settings
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Tune risk weights, auto-routing thresholds, and custom decision rules for your claims.
        </p>
        <div className="mt-8">
          <PolicyClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
