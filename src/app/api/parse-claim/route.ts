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
  const text = await file.text();

  // ── JSON: parse directly ───────────────────────────────────────────────────
  if (fileName.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return NextResponse.json({ fields: extractFromJson(parsed), method: "json" });
    } catch {
      return NextResponse.json({ error: "Invalid JSON file." }, { status: 422 });
    }
  }

  // ── CSV: parse first data row ──────────────────────────────────────────────
  if (fileName.endsWith(".csv")) {
    const fields = extractFromCsv(text);
    return NextResponse.json({ fields, method: "csv" });
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

  const prompt = `You are a claims data extraction assistant. Extract structured claim information from the document below and return ONLY a JSON object with these exact keys (omit any key where information is not present):

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
${text.slice(0, 6000)}

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

function extractFromJson(obj: Record<string, unknown>): ParsedClaimFields {
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
    else if (t.includes("receiv") || t.includes("deliver") || t.includes("missing")) fields.claimType = "not_received";
    else if (t.includes("wrong") || t.includes("incorrect")) fields.claimType = "wrong_item";
  }

  const delivery = get("deliverystatus", "delivery", "shipmentstatus", "status");
  if (typeof delivery === "string") {
    const d = delivery.toLowerCase();
    if (d.includes("intact") || d.includes("delivered")) fields.deliveryStatus = "delivered_intact";
    else if (d.includes("not") || d.includes("missing") || d.includes("failed")) fields.deliveryStatus = "not_delivered";
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

function extractFromCsv(csv: string): ParsedClaimFields {
  const lines = csv.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return {};

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const values = lines[1].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));

  const row: Record<string, unknown> = {};
  headers.forEach((h, i) => { row[h] = values[i] ?? ""; });

  return extractFromJson(row);
}
