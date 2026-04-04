import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ApiKeysClient } from "./api-keys-client";

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>

        {/* Settings nav */}
        <nav className="mt-6 flex gap-2">
          <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
            API Keys
          </span>
          <Link
            href="/settings/policy"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Risk &amp; Policy
          </Link>
          <Link
            href="/settings/integrations"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Integrations
          </Link>
        </nav>

        <p className="mt-6 text-sm text-zinc-500">
          API keys let you call TrustStack endpoints from your own systems.
        </p>
        <div className="mt-6">
          <ApiKeysClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
