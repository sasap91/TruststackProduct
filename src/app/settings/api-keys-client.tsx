"use client";

import { useCallback, useEffect, useState } from "react";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsed: string | null };

export function ApiKeysClient() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    const res = await fetch("/api/keys");
    const data = (await res.json()) as { keys: Key[] };
    setKeys(data.keys ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  async function createKey() {
    setCreating(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const data = (await res.json()) as { key: string };
    setNewKey(data.key);
    setNewName("");
    await fetchKeys();
    setCreating(false);
  }

  async function revokeKey(id: string) {
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setKeys((k) => k.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* New key just created — show once */}
      {newKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Key created — copy it now, it will not be shown again.
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {newKey}
          </code>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(newKey); }}
            className="mt-2 text-xs text-emerald-700 underline dark:text-emerald-400"
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="ml-4 mt-2 text-xs text-zinc-500 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Create form */}
      <div className="flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Key name (e.g. Production)"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={creating}
          onClick={() => void createKey()}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50 dark:bg-teal-500"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </div>

      {/* Keys table */}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No API keys yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Key prefix</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Created</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800/60 dark:bg-zinc-900/20">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{k.prefix}…</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(k.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {k.lastUsed
                      ? new Date(k.lastUsed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void revokeKey(k.id)}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
