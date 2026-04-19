"use client";

import { useEffect, useRef, useState } from "react";
import type { GuardianInputMode } from "@/lib/guardian/types";

interface Props {
  onSubmit: (data: {
    mode: GuardianInputMode;
    textPrompt?: string;
    imageBase64?: string;
    imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
    brandRules?: string[];
  }) => void;
  loading: boolean;
  prefillPrompt?: string;
  onPrefillConsumed?: () => void;
}

const TABS: { id: GuardianInputMode; label: string }[] = [
  { id: "text_prompt", label: "Text prompt" },
  { id: "image_upload", label: "Upload image" },
  { id: "both", label: "Both" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function PromptInput({ onSubmit, loading, prefillPrompt, onPrefillConsumed }: Props) {
  const [tab, setTab] = useState<GuardianInputMode>("text_prompt");
  const [textPrompt, setTextPrompt] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<"image/jpeg" | "image/png" | "image/webp" | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [brandRulesText, setBrandRulesText] = useState("");
  const [showBrandRules, setShowBrandRules] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefillPrompt) {
      setTab("text_prompt");
      setTextPrompt(prefillPrompt);
      onPrefillConsumed?.();
    }
  }, [prefillPrompt, onPrefillConsumed]);

  function handleFile(file: File) {
    setImageError(null);
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      setImageError("Only JPEG, PNG, and WebP files are accepted.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("File must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Strip data URL prefix to get raw base64
      const base64 = result.split(",")[1];
      setImageBase64(base64);
      setImageMediaType(file.type as "image/jpeg" | "image/png" | "image/webp");
      setImageFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const brandRules = brandRulesText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    onSubmit({
      mode: tab,
      textPrompt: (tab === "text_prompt" || tab === "both") ? textPrompt : undefined,
      imageBase64: (tab === "image_upload" || tab === "both") && imageBase64 ? imageBase64 : undefined,
      imageMediaType: (tab === "image_upload" || tab === "both") && imageMediaType ? imageMediaType : undefined,
      brandRules,
    });
  }

  const needsText = tab === "text_prompt" || tab === "both";
  const needsImage = tab === "image_upload" || tab === "both";

  const canSubmit =
    !loading &&
    (!needsText || textPrompt.trim().length >= 3) &&
    (!needsImage || !!imageBase64);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Text prompt */}
      {needsText && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Prompt
          </label>
          <textarea
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            minLength={3}
            maxLength={500}
            rows={4}
            placeholder="Describe the image you want to generate…"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <p className="mt-1 text-right text-xs text-zinc-400">{textPrompt.length}/500</p>
        </div>
      )}

      {/* Image upload */}
      {needsImage && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Image
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
              dragOver
                ? "border-zinc-400 bg-zinc-50 dark:bg-zinc-800"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {imageFileName ? (
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{imageFileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Drag & drop or click to upload
                </p>
                <p className="mt-1 text-xs text-zinc-400">JPEG, PNG, WebP · max 5 MB</p>
              </>
            )}
          </div>
          {imageError && <p className="mt-1 text-xs text-red-500">{imageError}</p>}
        </div>
      )}

      {/* Brand rules */}
      <div>
        <button
          type="button"
          onClick={() => setShowBrandRules((v) => !v)}
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400"
        >
          {showBrandRules ? "Hide" : "Custom brand rules (optional)"}
        </button>
        {showBrandRules && (
          <textarea
            value={brandRulesText}
            onChange={(e) => setBrandRulesText(e.target.value)}
            rows={3}
            placeholder={"No competitor logos\nNo celebrity likenesses"}
            className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Checking compliance…" : "Check compliance"}
      </button>
    </form>
  );
}
