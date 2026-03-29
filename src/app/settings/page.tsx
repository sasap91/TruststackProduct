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
        <p className="mt-2 text-sm text-zinc-500">
          API keys let you call TrustStack endpoints from your own systems.
        </p>
        <div className="mt-8">
          <ApiKeysClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
