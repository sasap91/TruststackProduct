"use client";

import { useCallback, useState } from "react";
import { RiskGauge } from "@/components/RiskGauge";
import { DecisionPanel, type ClaimAnalysisResult } from "@/components/DecisionPanel";

type Tab = "image" | "text" | "claim";

type AnalyzeResponse = {
  aiProbability: number;
  source: "huggingface" | "openai-moderation" | "demo";
  modelId?: string;
  notes?: string[];
  mime?: string;
};

// Metadata fields for the claim form
type ClaimMeta = {
  claimType: string;
  deliveryStatus: string;
  claimAgeHours: string;
  highValue: boolean;
  refundRate: string;
  hasVideoProof: boolean;
};

const DEFAULT_META: ClaimMeta = {
  claimType: "",
  deliveryStatus: "",
  claimAgeHours: "",
  highValue: false,
  refundRate: "",
  hasVideoProof: false,
};

// Policy configuration — overrides the engine's default thresholds
type PolicyInputs = {
  imageAiRejectThreshold: string;
  imageAiFlagThreshold: string;
  textAiFlagThreshold: string;
  lateFilingHours: string;
  highRefundRateThreshold: string;
  requireVideoForHighValue: boolean;
  customPolicyNotes: string;
};

const DEFAULT_POLICY: PolicyInputs = {
  imageAiRejectThreshold: "80",
  imageAiFlagThreshold: "55",
  textAiFlagThreshold: "75",
  lateFilingHours: "48",
  highRefundRateThreshold: "40",
  requireVideoForHighValue: true,
  customPolicyNotes: "",
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex items-center">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full bg-zinc-300 text-[9px] font-bold leading-none text-zinc-700 dark:bg-zinc-600 dark:text-zinc-300">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-zinc-700">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-800 dark:border-t-zinc-700" />
      </span>
    </span>
  );
}

function ImageDropzone({
  drag,
  onDragOver,
  onDragLeave,
  onDrop,
  onChange,
  fileName,
}: {
  drag: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onChange: (f: File) => void;
  fileName?: string;
}) {
  return (
    <label
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 transition-colors ${
        drag
          ? "border-teal-500 bg-teal-50/50 dark:border-teal-400 dark:bg-teal-950/20"
          : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
      }`}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      {fileName ? (
        <span className="text-center text-sm font-medium text-teal-700 dark:text-teal-400">
          {fileName}
        </span>
      ) : (
        <>
          <span className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            Drop an image here or click to upload
          </span>
          <span className="mt-1 text-xs text-zinc-400">JPEG, PNG, GIF, WebP · max 8 MB</span>
        </>
      )}
    </label>
  );
}

export function AnalyzerClient() {
  const [tab, setTab] = useState<Tab>("claim");

  // Image / Text tab state
  const [text, setText] = useState("");
  const [textModel, setTextModel] = useState<"huggingface" | "openai-moderation">("huggingface");
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  // Claim tab state
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [claimDrag, setClaimDrag] = useState(false);
  const [docFile, setDocFile]     = useState<File | null>(null);
  const [docDrag, setDocDrag]     = useState(false);
  const [claimText, setClaimText] = useState("");
  const [claimMeta, setClaimMeta] = useState<ClaimMeta>(DEFAULT_META);
  const [policyInputs, setPolicyInputs] = useState<PolicyInputs>(DEFAULT_POLICY);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimAnalysisResult | null>(null);

  // Data file upload state
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [dataDrag, setDataDrag] = useState(false);
  const [dataParsing, setDataParsing] = useState(false);
  const [dataParseNote, setDataParseNote] = useState<string | null>(null);
  const [dataParseMethod, setDataParseMethod] = useState<string | null>(null);

  // ── Data file parse handler ───────────────────────────────────────────────
  const parseDataFile = useCallback(async (file: File) => {
    setDataFile(file);
    setDataParsing(true);
    setDataParseNote(null);
    setDataParseMethod(null);

    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/parse-claim", { method: "POST", body: fd });
      const data = (await res.json()) as {
        fields?: {
          claimText?: string;
          claimType?: string;
          deliveryStatus?: string;
          claimAgeHours?: number;
          highValue?: boolean;
          refundRate?: number;
          hasVideoProof?: boolean;
          rawSummary?: string;
        };
        method?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        setDataParseNote(`Could not parse file: ${data.error ?? "unknown error"}`);
        return;
      }

      const f = data.fields ?? {};
      const filled: string[] = [];

      if (f.claimText) { setClaimText(f.claimText); filled.push("description"); }
      if (f.claimType) { setClaimMeta((m) => ({ ...m, claimType: f.claimType! })); filled.push("claim type"); }
      if (f.deliveryStatus) { setClaimMeta((m) => ({ ...m, deliveryStatus: f.deliveryStatus! })); filled.push("delivery status"); }
      if (f.claimAgeHours != null) { setClaimMeta((m) => ({ ...m, claimAgeHours: String(f.claimAgeHours) })); filled.push("claim age"); }
      if (f.highValue != null) { setClaimMeta((m) => ({ ...m, highValue: f.highValue! })); filled.push("high value"); }
      if (f.refundRate != null) { setClaimMeta((m) => ({ ...m, refundRate: String(f.refundRate) })); filled.push("refund rate"); }
      if (f.hasVideoProof != null) { setClaimMeta((m) => ({ ...m, hasVideoProof: f.hasVideoProof! })); filled.push("video proof"); }

      setDataParseMethod(data.method ?? null);
      setDataParseNote(
        filled.length
          ? `Auto-filled: ${filled.join(", ")}.${f.rawSummary ? ` Summary: ${f.rawSummary}` : ""}`
          : "File parsed but no matching fields found — please fill in manually.",
      );
    } catch {
      setDataParseNote("Network error while parsing file.");
    } finally {
      setDataParsing(false);
    }
  }, []);

  // ── Image / Text tab handlers ─────────────────────────────────────────────
  const analyzeImageFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/analyze/image", { method: "POST", body: fd });
      const data = (await res.json()) as AnalyzeResponse & { error?: string };
      if (!res.ok) { setError(data.error || "Request failed."); return; }
      setResult(data);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeText = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: textModel }),
      });
      const data = (await res.json()) as AnalyzeResponse & { error?: string };
      if (!res.ok) { setError(data.error || "Request failed."); return; }
      setResult(data);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [text, textModel]);

  // ── Claim tab handler ─────────────────────────────────────────────────────
  const analyzeClaim = useCallback(async () => {
    if (!claimText.trim()) return;
    setClaimLoading(true);
    setClaimError(null);
    setClaimResult(null);

    const fd = new FormData();
    if (claimFile) fd.set("file", claimFile);
    if (docFile)   fd.set("document", docFile);
    fd.set("claimText", claimText.trim());
    if (claimMeta.claimType) fd.set("claimType", claimMeta.claimType);
    if (claimMeta.deliveryStatus) fd.set("deliveryStatus", claimMeta.deliveryStatus);
    if (claimMeta.claimAgeHours) fd.set("claimAgeHours", claimMeta.claimAgeHours);
    if (claimMeta.highValue) fd.set("highValue", "true");
    if (claimMeta.refundRate) fd.set("refundRate", claimMeta.refundRate);
    if (claimMeta.hasVideoProof) fd.set("hasVideoProof", "true");

    // Policy overrides — convert % inputs to 0–1 fractions
    fd.set("imageAiRejectThreshold", String(Number(policyInputs.imageAiRejectThreshold) / 100));
    fd.set("imageAiFlagThreshold", String(Number(policyInputs.imageAiFlagThreshold) / 100));
    fd.set("textAiFlagThreshold", String(Number(policyInputs.textAiFlagThreshold) / 100));
    fd.set("lateFilingHours", policyInputs.lateFilingHours);
    fd.set("highRefundRateThreshold", String(Number(policyInputs.highRefundRateThreshold) / 100));
    if (!policyInputs.requireVideoForHighValue) fd.set("requireVideoForHighValue", "false");
    if (policyInputs.customPolicyNotes.trim()) fd.set("customPolicyNotes", policyInputs.customPolicyNotes.trim());

    try {
      const res = await fetch("/api/analyze/claim", { method: "POST", body: fd });
      const data = (await res.json()) as ClaimAnalysisResult & { error?: string };
      if (!res.ok) { setClaimError((data as { error?: string }).error || "Request failed."); return; }
      setClaimResult(data);
    } catch {
      setClaimError("Network error.");
    } finally {
      setClaimLoading(false);
    }
  }, [claimFile, docFile, claimText, claimMeta, policyInputs]);

  const resetTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setResult(null);
    setClaimError(null);
    setClaimResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex rounded-full border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/80">
        {(
          [
            ["claim", "Claim Analysis"],
            ["image", "Image only"],
            ["text", "Text only"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => resetTab(id)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Claim tab ─────────────────────────────────────────────────────── */}
      {tab === "claim" && (
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-4">
            {/* Data file upload */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Import claim data{" "}
                <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional — JSON, CSV, PDF, TXT)</span>
              </p>
              <label
                onDragOver={(e) => { e.preventDefault(); setDataDrag(true); }}
                onDragLeave={() => setDataDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDataDrag(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void parseDataFile(f);
                }}
                className={`flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-5 transition-colors ${
                  dataDrag
                    ? "border-teal-500 bg-teal-50/50 dark:border-teal-400 dark:bg-teal-950/20"
                    : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="file"
                  accept=".json,.csv,.pdf,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void parseDataFile(f);
                  }}
                />
                {dataParsing ? (
                  <span className="text-sm text-teal-600 dark:text-teal-400">Parsing file…</span>
                ) : dataFile ? (
                  <span className="text-sm font-medium text-teal-700 dark:text-teal-400">{dataFile.name}</span>
                ) : (
                  <>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Drop a claim file or click to upload
                    </span>
                    <span className="mt-0.5 text-xs text-zinc-400">Structured or unstructured — fields auto-filled</span>
                  </>
                )}
              </label>

              {/* Parse result banner */}
              {dataParseNote && !dataParsing ? (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${
                  dataParseNote.startsWith("Could not") || dataParseNote.startsWith("Network")
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                    : "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-300"
                }`}>
                  {dataParseMethod ? (
                    <span className="mr-1.5 rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] text-teal-700 dark:bg-teal-900/60 dark:text-teal-400">
                      {dataParseMethod}
                    </span>
                  ) : null}
                  {dataParseNote}
                </div>
              ) : null}
            </div>

            {/* Evidence slots — image + document */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Image evidence{" "}
                  <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
                </p>
                <ImageDropzone
                  drag={claimDrag}
                  fileName={claimFile?.name}
                  onDragOver={(e) => { e.preventDefault(); setClaimDrag(true); }}
                  onDragLeave={() => setClaimDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setClaimDrag(false);
                    const f = e.dataTransfer.files[0];
                    if (f) setClaimFile(f);
                  }}
                  onChange={(f) => setClaimFile(f)}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Document evidence{" "}
                  <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
                </p>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDocDrag(true); }}
                  onDragLeave={() => setDocDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDocDrag(false);
                    const f = e.dataTransfer.files[0];
                    if (f) setDocFile(f);
                  }}
                  className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 transition-colors ${
                    docDrag
                      ? "border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/20"
                      : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.csv,.json,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setDocFile(f);
                    }}
                  />
                  {docFile ? (
                    <span className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
                      {docFile.name}
                    </span>
                  ) : (
                    <>
                      <span className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                        Drop a document or click to upload
                      </span>
                      <span className="mt-1 text-xs text-zinc-400">PDF, TXT, CSV, JSON · max 8 MB</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Claim text */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Claim description <span className="text-red-500">*</span>
              </p>
              <textarea
                value={claimText}
                onChange={(e) => setClaimText(e.target.value)}
                placeholder="Describe the claim — e.g. 'Item arrived with a cracked screen and dented casing…'"
                rows={4}
                className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
            </div>

            {/* Metadata */}
            <details className="rounded-2xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Order & policy metadata (optional)
              </summary>
              <div className="grid gap-3 px-4 pb-4 pt-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Claim type</label>
                  <select
                    value={claimMeta.claimType}
                    onChange={(e) => setClaimMeta((m) => ({ ...m, claimType: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Unknown</option>
                    <option value="damaged_item">Damaged item</option>
                    <option value="not_received">Not received</option>
                    <option value="wrong_item">Wrong item</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Delivery status</label>
                  <select
                    value={claimMeta.deliveryStatus}
                    onChange={(e) => setClaimMeta((m) => ({ ...m, deliveryStatus: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Unknown</option>
                    <option value="delivered_intact">Delivered intact</option>
                    <option value="not_delivered">Not delivered</option>
                    <option value="unknown">Unscanned</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Claim age (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={claimMeta.claimAgeHours}
                    onChange={(e) => setClaimMeta((m) => ({ ...m, claimAgeHours: e.target.value }))}
                    placeholder="e.g. 24"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Customer refund rate (0–1)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={claimMeta.refundRate}
                    onChange={(e) => setClaimMeta((m) => ({ ...m, refundRate: e.target.value }))}
                    placeholder="e.g. 0.45"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="highValue"
                    type="checkbox"
                    checked={claimMeta.highValue}
                    onChange={(e) => setClaimMeta((m) => ({ ...m, highValue: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300 accent-teal-600"
                  />
                  <label htmlFor="highValue" className="text-sm text-zinc-600 dark:text-zinc-400">
                    High-value item
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="hasVideoProof"
                    type="checkbox"
                    checked={claimMeta.hasVideoProof}
                    onChange={(e) =>
                      setClaimMeta((m) => ({ ...m, hasVideoProof: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-zinc-300 accent-teal-600"
                  />
                  <label htmlFor="hasVideoProof" className="text-sm text-zinc-600 dark:text-zinc-400">
                    Video proof provided
                  </label>
                </div>
              </div>
            </details>

            {/* Policy inputs */}
            <details className="rounded-2xl border border-teal-200 bg-teal-50/40 dark:border-teal-800/50 dark:bg-teal-950/20">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-teal-800 dark:text-teal-300">
                Policy settings
              </summary>
              <div className="space-y-4 px-4 pb-4 pt-2">
                {/* Threshold row */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 flex items-center text-xs text-zinc-500">
                      Image AI — reject if ≥ (%)
                      <InfoTooltip text="If the AI-generation score for the attached image is at or above this number, the claim is automatically rejected. Enter a whole number from 0–100. Default: 80 means reject when the image is ≥80% likely AI-generated." />
                    </label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={policyInputs.imageAiRejectThreshold}
                      onChange={(e) => setPolicyInputs((p) => ({ ...p, imageAiRejectThreshold: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center text-xs text-zinc-500">
                      Image AI — flag if ≥ (%)
                      <InfoTooltip text="If the image score is at or above this number but below the reject threshold, the claim is flagged for manual review instead of auto-rejected. Enter a whole number from 0–100. Default: 55. Must be lower than the reject threshold." />
                    </label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={policyInputs.imageAiFlagThreshold}
                      onChange={(e) => setPolicyInputs((p) => ({ ...p, imageAiFlagThreshold: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center text-xs text-zinc-500">
                      Text AI — flag if ≥ (%)
                      <InfoTooltip text="If the AI-written score for the claim text is at or above this number, the text is flagged as potentially AI-generated. Enter a whole number from 0–100. Default: 75." />
                    </label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={policyInputs.textAiFlagThreshold}
                      onChange={(e) => setPolicyInputs((p) => ({ ...p, textAiFlagThreshold: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 flex items-center text-xs text-zinc-500">
                      Late filing window (hours)
                      <InfoTooltip text="Claims submitted more than this many hours after the incident occurred are considered late and treated as higher risk. Enter a whole number (e.g. 48 = claims filed more than 2 days after the event are late). Default: 48." />
                    </label>
                    <input
                      type="number" min="1"
                      value={policyInputs.lateFilingHours}
                      onChange={(e) => setPolicyInputs((p) => ({ ...p, lateFilingHours: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center text-xs text-zinc-500">
                      High refund rate threshold (%)
                      <InfoTooltip text="If the customer's historical refund rate exceeds this percentage, their claim is treated as high-risk. Enter a whole number from 0–100 representing the customer's refund rate (e.g. 40 = flag customers who have refunded more than 40% of their orders). Default: 40." />
                    </label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={policyInputs.highRefundRateThreshold}
                      onChange={(e) => setPolicyInputs((p) => ({ ...p, highRefundRateThreshold: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="requireVideo"
                    type="checkbox"
                    checked={policyInputs.requireVideoForHighValue}
                    onChange={(e) => setPolicyInputs((p) => ({ ...p, requireVideoForHighValue: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300 accent-teal-600"
                  />
                  <label htmlFor="requireVideo" className="flex items-center text-sm text-zinc-600 dark:text-zinc-400">
                    Require video proof for high-value claims
                    <InfoTooltip text="When enabled, any high-value claim submitted without video evidence will be flagged for manual review regardless of other scores." />
                  </label>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Custom policy notes{" "}
                    <span className="text-zinc-400">(passed verbatim to the AI judge)</span>
                  </label>
                  <textarea
                    value={policyInputs.customPolicyNotes}
                    onChange={(e) => setPolicyInputs((p) => ({ ...p, customPolicyNotes: e.target.value }))}
                    placeholder="e.g. Our return window is 30 days. Electronics claims require a serial number match. Reject any claim where the item was marked delivered by our carrier."
                    rows={3}
                    className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                </div>
              </div>
            </details>

            <button
              type="button"
              disabled={claimLoading || !claimText.trim()}
              onClick={() => void analyzeClaim()}
              className="w-full rounded-full bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400"
            >
              {claimLoading ? "Analyzing claim…" : "Analyze claim"}
            </button>

            {claimError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {claimError}
              </p>
            ) : null}
          </div>

          <div>
            {claimResult ? (
              <DecisionPanel result={claimResult} />
            ) : (
              <div className="flex min-h-[340px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-500">
                {claimLoading
                  ? "Running 3-layer analysis…"
                  : "Enter a claim description to run the full risk analysis. Image and document evidence are optional."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Image only tab ─────────────────────────────────────────────────── */}
      {tab === "image" && (
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-4">
            <ImageDropzone
              drag={drag}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) void analyzeImageFile(f);
              }}
              onChange={(f) => void analyzeImageFile(f)}
            />
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}
          </div>
          <div>
            {result ? (
              <>
                <RiskGauge probability={result.aiProbability} label="Image scan" />
                <SourceCard result={result} />
              </>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>
        </div>
      )}

      {/* ── Text only tab ──────────────────────────────────────────────────── */}
      {tab === "text" && (
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-3">
            {/* Model selector */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Detection model
              </p>
              <div className="flex gap-2">
                {(
                  [
                    {
                      id: "huggingface",
                      label: "HuggingFace RoBERTa",
                      sub: "AI-generated text detector",
                    },
                    {
                      id: "openai-moderation",
                      label: "OpenAI Safeguard",
                      sub: "omni-moderation-latest",
                    },
                  ] as const
                ).map(({ id, label, sub }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTextModel(id); setResult(null); setError(null); }}
                    className={`flex flex-1 flex-col rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      textModel === id
                        ? "border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40"
                        : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span className={`text-sm font-medium ${textModel === id ? "text-teal-800 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {label}
                    </span>
                    <span className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{sub}</span>
                  </button>
                ))}
              </div>
              {textModel === "openai-moderation" && (
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  Scores fraud/deception risk via OpenAI&apos;s content safety API. Requires <span className="font-mono">OPENAI_API_KEY</span> in .env.local.
                </p>
              )}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste copy, a draft email, a social post…"
              rows={10}
              className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <button
              type="button"
              disabled={loading || !text.trim()}
              onClick={() => void analyzeText()}
              className="w-full rounded-full bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400"
            >
              {loading ? "Analyzing…" : "Analyze text"}
            </button>
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}
          </div>
          <div>
            {result ? (
              <>
                <RiskGauge probability={result.aiProbability} label="Text scan" />
                <SourceCard result={result} />
              </>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceCard({ result }: { result: AnalyzeResponse }) {
  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="font-medium text-zinc-800 dark:text-zinc-200">Source</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        {result.source === "huggingface" ? (
          <>
            HuggingFace RoBERTa — AI-generated text detector
            {result.modelId ? (
              <> <span className="font-mono text-xs text-zinc-500">({result.modelId})</span></>
            ) : null}
          </>
        ) : result.source === "openai-moderation" ? (
          <>
            OpenAI Safeguard — content moderation API
            {result.modelId ? (
              <> <span className="font-mono text-xs text-zinc-500">({result.modelId})</span></>
            ) : null}
          </>
        ) : (
          "Demo mode (configure API keys for real inference)"
        )}
      </p>
      {result.mime ? (
        <p className="mt-2 text-xs text-zinc-500">Detected type: {result.mime}</p>
      ) : null}
      {result.notes?.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-800 dark:text-amber-200/90">
          {result.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-500">
      {loading ? "Running detection…" : "Results will appear here after you analyze."}
    </div>
  );
}
