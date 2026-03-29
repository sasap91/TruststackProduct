import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { AnalyzerClient } from "./analyzer-client";
import { CasesList } from "./cases-list";

export default function DashboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Risk console
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Upload media or paste text to estimate AI-generation likelihood. Wire your own models and
            policies as you grow.
          </p>
        </div>
        <AnalyzerClient />
        <CasesList />
      </main>
      <SiteFooter />
    </>
  );
}
