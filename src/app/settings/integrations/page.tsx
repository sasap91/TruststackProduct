import { SiteHeader }        from "@/components/SiteHeader";
import { SiteFooter }        from "@/components/SiteFooter";
import { IntegrationsClient } from "./integrations-client";

export default function IntegrationsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Integrations
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Connect TrustStack to your store to automate refund execution and enrich claim evidence.
        </p>
        <div className="mt-8">
          <IntegrationsClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
