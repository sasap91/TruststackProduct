"use client";

import { useCallback, useEffect, useId, useState } from "react";

type RiskWeights = {
  fraud:          number;
  claimIntegrity: number;
  account:        number;
  procedural:     number;
};

type CustomRule = {
  id:         string;
  name:       string;
  signal_key: string;
  outcome:    string;
  priority:   number;
  override:   boolean;
};

type PolicyData = {
  riskWeights:         RiskWeights;
  autoApproveBelow:    number;
  autoRejectAbove:     number;
  reviewBand:          { low: number; high: number };
  claimValueThreshold: number | null;
  maxRefundsPerMonth:  number | null;
  customRules:         CustomRule[];
};

const OUTCOMES = ["approve", "review", "reject", "request_more_evidence"] as const;

function pct(v: number) { return Math.round(v * 100); }
function dec(v: number) { return v / 100; }

function newRule(): CustomRule {
  return {
    id:         crypto.randomUUID(),
    name:       "",
    signal_key: "",
    outcome:    "review",
    priority:   50,
    override:   false,
  };
}

export function PolicyClient() {
  const uid = useId();
  const [data, setData] = useState<PolicyData | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    const res  = await fetch("/api/settings/policy");
    const json = (await res.json()) as PolicyData;
    setData(json);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  const w   = data.riskWeights;
  const sum = pct(w.fraud) + pct(w.claimIntegrity) + pct(w.account) + pct(w.procedural);

  function setWeight(key: keyof RiskWeights, value: number) {
    setData((d) => d && ({ ...d, riskWeights: { ...d.riskWeights, [key]: dec(value) } }));
  }

  function setField<K extends keyof PolicyData>(key: K, value: PolicyData[K]) {
    setData((d) => d && ({ ...d, [key]: value }));
  }

  function addRule() {
    setData((d) => d && ({ ...d, customRules: [...d.customRules, newRule()] }));
  }

  function updateRule(id: string, patch: Partial<CustomRule>) {
    setData((d) => d && ({
      ...d,
      customRules: d.customRules.map((r) => r.id === id ? { ...r, ...patch } : r),
    }));
  }

  function removeRule(id: string) {
    setData((d) => d && ({ ...d, customRules: d.customRules.filter((r) => r.id !== id) }));
  }

  async function save() {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/settings/policy", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setToast({ ok: true, msg: "Policy saved." });
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  const sumOk = sum === 100;

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${toast.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Risk Weights ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Risk Category Weights</h2>
        <p className="mt-1 text-xs text-zinc-500">Values must sum to 100%. Weights tune how each signal category influences the risk score.</p>

        <div className="mt-5 space-y-4">
          {(
            [
              { key: "fraud",          label: "Fraud Evidence",   hint: "Image/document manipulation, invoice mismatch" },
              { key: "claimIntegrity", label: "Claim Integrity",  hint: "Suspicious language, logistics conflicts" },
              { key: "account",        label: "Account Risk",     hint: "Refund history, new accounts, high-value items" },
              { key: "procedural",     label: "Procedural",       hint: "Late filing, missing video proof" },
            ] as const
          ).map(({ key, label, hint }) => {
            const val = pct(w[key]);
            return (
              <div key={key}>
                <div className="flex items-center justify-between">
                  <label htmlFor={`${uid}-${key}`} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {label}
                  </label>
                  <span className="text-xs tabular-nums text-zinc-500">{val}%</span>
                </div>
                <p className="mb-1 text-xs text-zinc-400">{hint}</p>
                <input
                  id={`${uid}-${key}`}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={val}
                  onChange={(e) => setWeight(key, Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
              </div>
            );
          })}
        </div>

        <p className={`mt-3 text-xs font-medium ${sumOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          Total: {sum}% {sumOk ? "✓" : "(must equal 100%)"}
        </p>
      </section>

      {/* ── Auto-routing Thresholds ──────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Auto-routing Thresholds</h2>
        <p className="mt-1 text-xs text-zinc-500">Claims below the approve threshold are auto-approved; above the reject threshold are auto-rejected.</p>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-approve`} className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Auto-approve below (0–1)
            </label>
            <input
              id={`${uid}-approve`}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={data.autoApproveBelow}
              onChange={(e) => setField("autoApproveBelow", Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-reject`} className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Auto-reject above (0–1)
            </label>
            <input
              id={`${uid}-reject`}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={data.autoRejectAbove}
              onChange={(e) => setField("autoRejectAbove", Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
      </section>

      {/* ── Optional Limits ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Optional Limits</h2>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-cvt`} className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Claim value threshold ($)
            </label>
            <input
              id={`${uid}-cvt`}
              type="number"
              min={0}
              step={1}
              placeholder="No limit"
              value={data.claimValueThreshold ?? ""}
              onChange={(e) => setField("claimValueThreshold", e.target.value === "" ? null : Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-mrm`} className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Max refunds / month
            </label>
            <input
              id={`${uid}-mrm`}
              type="number"
              min={1}
              step={1}
              placeholder="No limit"
              value={data.maxRefundsPerMonth ?? ""}
              onChange={(e) => setField("maxRefundsPerMonth", e.target.value === "" ? null : Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
      </section>

      {/* ── Custom Rules ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Custom Rules</h2>
            <p className="mt-1 text-xs text-zinc-500">Override pipeline decisions when a specific signal is flagged as risk.</p>
          </div>
          <button
            type="button"
            onClick={addRule}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-500 dark:bg-teal-500"
          >
            Add rule
          </button>
        </div>

        {data.customRules.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
            No custom rules. Click &ldquo;Add rule&rdquo; to create one.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Signal key</th>
                  <th className="pb-2 pr-3 font-medium">Outcome</th>
                  <th className="pb-2 pr-3 font-medium">Priority</th>
                  <th className="pb-2 pr-3 font-medium">Override</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.customRules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={rule.name}
                        placeholder="Rule name"
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                        className="w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={rule.signal_key}
                        placeholder="e.g. high_refund_rate"
                        onChange={(e) => updateRule(rule.id, { signal_key: e.target.value })}
                        className="w-44 rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-900 focus:border-teal-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={rule.outcome}
                        onChange={(e) => updateRule(rule.id, { outcome: e.target.value })}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {OUTCOMES.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        value={rule.priority}
                        min={1}
                        max={999}
                        onChange={(e) => updateRule(rule.id, { priority: Number(e.target.value) })}
                        className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={rule.override}
                        onChange={(e) => updateRule(rule.id, { override: e.target.checked })}
                        className="accent-teal-600"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRule(rule.id)}
                        className="text-xs text-red-500 hover:text-red-700 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving || !sumOk}
          onClick={() => void save()}
          className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50 dark:bg-teal-500"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
      </div>
    </div>
  );
}
