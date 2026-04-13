import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/apikey-auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB for text files

export type ParsedClaimFields = {
  claimText?: string;
  claimType?: string;
  deliveryStatus?: string;
  claimAgeHours?: number;
  highValue?: boolean;
  refundRate?: number;
  hasVideoProof?: boolean;
  rawSummary?: string;
};

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Expected file field." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 4 MB)." }, { status: 413 });
  }

  const fileName = file instanceof File ? file.name.toLowerCase() : "";
  const contentType = file instanceof File ? file.type.toLowerCase() : "";
  const text = await file.text();

  // ── JSON: parse directly, including arrays of rows ────────────────────────
  if (fileName.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const result = extractFromStructuredJson(parsed);
      return NextResponse.json({ fields: result.fields, method: result.method });
    } catch {
      return NextResponse.json({ error: "Invalid JSON file." }, { status: 422 });
    }
  }

  // ── Tabular text: parse every row and normalize columns ────────────────────
  if (fileName.endsWith(".csv") || fileName.endsWith(".tsv") || contentType.includes("tab-separated")) {
    const result = extractFromDelimitedText(text, fileName.endsWith(".tsv") ? "\t" : undefined);
    return NextResponse.json({ fields: result.fields, method: result.method });
  }

  // ── PDF / TXT / everything else → Claude ──────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured — required for PDF/text parsing." },
      { status: 503 },
    );
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a claims data extraction assistant. Extract structured claim information from the document below, even if the file is messy, partially structured, or contains many unrelated columns/rows. Return ONLY a JSON object with these exact keys (omit any key where information is not present):

{
  "claimText": "full claim description as written",
  "claimType": "damaged_item" | "not_received" | "wrong_item",
  "deliveryStatus": "delivered_intact" | "not_delivered" | "unknown",
  "claimAgeHours": <number of hours since incident, if mentioned>,
  "highValue": true | false,
  "refundRate": <0–1 if historical refund rate mentioned>,
  "hasVideoProof": true | false,
  "rawSummary": "1-sentence summary of what this document is about"
}

DOCUMENT:
${buildDocumentExcerpt(text)}

Return ONLY the JSON object, no explanation.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("No text response");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const fields = JSON.parse(jsonMatch[0]) as ParsedClaimFields;
    return NextResponse.json({ fields, method: "claude" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Extraction failed: ${msg}` }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractFromJson(obj: Record<string, unknown>): ParsedClaimFields {
  const get = (...keys: string[]): unknown => {
    for (const key of keys) {
      const found = Object.entries(obj).find(
        ([k]) => k.toLowerCase().replace(/[_\s-]/g, "") === key.toLowerCase().replace(/[_\s-]/g, ""),
      );
      if (found !== undefined) return found[1];
    }
    return undefined;
  };

  const fields: ParsedClaimFields = {};

  const desc = get("claimtext", "claimdescription", "description", "reason", "notes", "comment");
  if (typeof desc === "string") fields.claimText = desc;

  const type = get("claimtype", "type", "category");
  if (typeof type === "string") {
    const t = type.toLowerCase();
    if (t.includes("damage")) fields.claimType = "damaged_item";
    else if (t.includes("not") && (t.includes("receiv") || t.includes("deliver") || t.includes("missing"))) fields.claimType = "not_received";
    else if (t.includes("receiv") || t.includes("deliver") || t.includes("missing")) fields.claimType = "not_received";
    else if (t.includes("wrong") || t.includes("incorrect")) fields.claimType = "wrong_item";
  }

  const delivery = get("deliverystatus", "delivery", "shipmentstatus", "orderstatus", "status");
  if (typeof delivery === "string") {
    const d = delivery.toLowerCase();
    if (d.includes("not") || d.includes("missing") || d.includes("failed") || d.includes("undelivered")) fields.deliveryStatus = "not_delivered";
    else if (d.includes("intact") || d.includes("delivered")) fields.deliveryStatus = "delivered_intact";
    else fields.deliveryStatus = "unknown";
  }

  const age = get("claimagehours", "age", "hourssince", "hoursago");
  if (typeof age === "number") fields.claimAgeHours = age;
  if (typeof age === "string" && !isNaN(Number(age))) fields.claimAgeHours = Number(age);

  const hv = get("highvalue", "highticket", "expensive");
  if (typeof hv === "boolean") fields.highValue = hv;
  if (typeof hv === "string") fields.highValue = ["true", "yes", "1"].includes(hv.toLowerCase());

  const rr = get("refundrate", "refundhistory", "returnrate");
  if (typeof rr === "number") fields.refundRate = Math.min(1, Math.max(0, rr));
  if (typeof rr === "string" && !isNaN(Number(rr))) fields.refundRate = Math.min(1, Math.max(0, Number(rr)));

  const vp = get("videoproof", "video", "hasvideo", "videoevidence");
  if (typeof vp === "boolean") fields.hasVideoProof = vp;
  if (typeof vp === "string") fields.hasVideoProof = ["true", "yes", "1"].includes(vp.toLowerCase());

  return fields;
}

export function extractFromStructuredJson(parsed: unknown): { fields: ParsedClaimFields; method: string } {
  if (Array.isArray(parsed)) {
    const rows = parsed.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item));
    return { fields: extractFromRowSet(rows), method: "json-array" };
  }
  if (parsed !== null && typeof parsed === "object") {
    return { fields: extractFromJson(parsed as Record<string, unknown>), method: "json" };
  }
  return { fields: {}, method: "json" };
}

export function extractFromDelimitedText(text: string, delimiter?: string): { fields: ParsedClaimFields; method: string } {
  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length === 0) return { fields: {}, method: delimiter === "\t" ? "tsv" : "csv" };
  return { fields: extractFromRowSet(rows), method: delimiter === "\t" ? "tsv" : "csv" };
}

export function extractFromRowSet(rows: Array<Record<string, unknown>>): ParsedClaimFields {
  const merged: Record<string, unknown> = {};
  for (const row of rows.slice(0, 25)) {
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
      if (merged[normalizedKey] === undefined && value !== "" && value != null) {
        merged[normalizedKey] = value;
      }
    }
  }
  return extractFromJson(merged);
}

export function parseDelimitedRows(text: string, explicitDelimiter?: string): Array<Record<string, unknown>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = explicitDelimiter ?? detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, unknown>> = [];

  for (const line of lines.slice(1, 51)) {
    const values = parseDelimitedLine(line, delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      row[h] = values[i] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export function detectDelimiter(sample: string): string {
  const candidates = [",", "\t", "|", ";"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = parseDelimitedLine(sample, delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values.map((v) => v.replace(/^"|"$/g, ""));
}

export function buildDocumentExcerpt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const head = trimmed.slice(0, 4000);
  const tail = trimmed.length > 4000 ? `\n\n[truncated ${trimmed.length - 4000} chars]` : "";
  return `${head}${tail}`;
}
