"use client";

import { useCallback, useEffect, useId, useState } from "react";

type ConnectionStatus =
  | { connected: false }
  | {
      connected:    true;
      shop:         string;
      syncEnabled:  boolean;
      webhookCount: number;
      connectedAt:  string;
    };

export function IntegrationsClient() {
  const uid = useId();
  const [status,       setStatus]       = useState<ConnectionStatus | null>(null);
  const [shopInput,    setShopInput]    = useState("");
  const [connecting,   setConnecting]   = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast,        setToast]        = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    const res  = await fetch("/api/integrations/shopify");
    const json = (await res.json()) as ConnectionStatus;
    setStatus(json);

    // Show a success toast if redirected back after OAuth
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("connected") === "1") {
        setToast({ ok: true, msg: "Shopify store connected successfully." });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    const shop = shopInput.trim().toLowerCase();
    if (!shop) return;
    setConnecting(true);
    // Redirect to OAuth start — server handles the rest
    window.location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`;
  }

  async function disconnect() {
    if (!confirm("Disconnect your Shopify store? TrustStack will stop issuing refunds via API.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/shopify", { method: "DELETE" });
      if (!res.ok) throw new Error("Disconnect failed.");
      setToast({ ok: true, msg: "Shopify store disconnected." });
      setStatus({ connected: false });
      setShopInput("");
    } catch {
      setToast({ ok: false, msg: "Disconnect failed. Please try again." });
    } finally {
      setDisconnecting(false);
    }
  }

  if (status === null) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${toast.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
        }`}>
          <span>{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shopify card */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        {/* Card header */}
        <div className="flex items-center gap-4 border-b border-zinc-100 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          {/* Shopify bag icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#96BF48]/10">
            <svg viewBox="0 0 109 124" className="h-6 w-6 fill-[#96BF48]" aria-hidden="true">
              <path d="M74.7 14.8s-.3-.1-.7-.1c-.4 0-.9.1-1.4.3-.9-2.6-2.5-5-4.4-6.7C66 6.1 63.3 5 60.5 5c-.2 0-.4 0-.7.1C58.7 3.8 57.3 3 55.8 3c-5.6 0-8.3 7-9.1 10.5-2.2.7-3.7 1.1-3.9 1.2-2.5.8-2.5.8-2.8 3.1-.2 1.7-6.5 50.2-6.5 50.2l48.5 8.4 20.9-5.3S74.7 14.8 74.7 14.8zm-16-5.3c1 0 1.9.4 2.6 1.2-1.3.6-2.7 1.5-3.9 2.7-.6-1.4-1.4-2.6-2.3-3.5 1-.3 2.1-.4 3.6-.4zm-3.9 5.6c-2.2.7-4.5 1.4-6.9 2.1.7-2.6 2-5.1 3.9-6.8.7 1.4 1.9 3.3 3 4.7zm-7.4-8.2c.7 0 1.3.2 1.9.6-2.2 2-3.8 5-4.7 7.9l-5.7 1.8c.8-3.2 3.4-10.3 8.5-10.3z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Shopify</p>
            <p className="text-xs text-zinc-500">Automate refund execution and sync order data for fraud detection.</p>
          </div>
          {status.connected && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="px-5 py-5 bg-white dark:bg-zinc-900/20">
          {status.connected ? (
            <div className="space-y-4">
              {/* Store details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">Store</p>
                  <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{status.shop}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Connected</p>
                  <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {new Date(status.connectedAt).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Active webhooks</p>
                  <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{status.webhookCount}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Auto-refund</p>
                  <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {status.syncEnabled ? "Enabled" : "Paused"}
                  </p>
                </div>
              </div>

              {/* What this does */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Active capabilities</p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  <li>✓ Automatic refund execution when TrustStack approves a claim</li>
                  <li>✓ Order fulfillment data synced for velocity fraud detection</li>
                  <li>✓ Refund events appended to case audit trail</li>
                </ul>
              </div>

              <button
                type="button"
                disabled={disconnecting}
                onClick={() => void disconnect()}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect store"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Enter your Shopify store domain to start the OAuth flow. You&apos;ll be redirected to
                Shopify to approve access, then returned here automatically.
              </p>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    id={`${uid}-shop`}
                    type="text"
                    value={shopInput}
                    onChange={(e) => setShopInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void connect()}
                    placeholder="mybrand.myshopify.com"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  disabled={connecting || !shopInput.trim()}
                  onClick={() => void connect()}
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50 dark:bg-teal-500"
                >
                  {connecting ? "Redirecting…" : "Connect Shopify"}
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Requires scopes: <code className="font-mono">read_orders, read_customers, write_refunds</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
