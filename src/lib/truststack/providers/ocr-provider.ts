/**
 * OCRProvider — text extraction from receipts, labels, invoices, screenshots.
 *
 * Business logic consumes only OcrExtraction (structured text + blocks + kind),
 * never vendor-specific response shapes. DocumentEvidenceAgent runs OCR first,
 * then delegates structured parsing to DocumentProvider.
 *
 * Registered adapters (add as integrations mature):
 *   - MockOcrProvider     (default — local / deterministic, no external calls)
 *   - TesseractProvider   (future)
 *   - TextractProvider    (future)
 *   - VisionOcrProvider   (future — multimodal doc photos)
 */

// ── Structured output (convertible to signals downstream) ───────────────────

export type OcrBoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrBlock = {
  text: string;
  confidence: number;
  bbox?: OcrBoundingBox;
};

export type OcrDocumentKind =
  | "receipt"
  | "shipping_label"
  | "invoice"
  | "screenshot"
  | "generic"
  | "unknown";

export type OcrExtraction = {
  /** Normalized plain text for downstream extractors */
  fullPlainText: string;
  blocks: OcrBlock[];
  documentKind: OcrDocumentKind;
  overallConfidence: number;
  languageHints?: string[];
  notes?: string[];
};

export type OcrInput = {
  /** Pre-extracted text (e.g. from PDF parser) — mock OCR pass-through */
  textContent?: string;
  /** Raw bytes for scans / photos — mock produces deterministic fake lines */
  imageBuffer?: ArrayBuffer;
  mimeType?: string;
  filename?: string;
};

export interface OCRProvider {
  readonly providerId: string;
  extract(input: OcrInput): Promise<OcrExtraction>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fnv32(data: Uint8Array, limit = 512): number {
  let h = 0x811c9dc5;
  const end = Math.min(data.length, limit);
  for (let i = 0; i < end; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function inferKind(
  filename: string | undefined,
  mimeType: string | undefined,
  text: string,
): OcrDocumentKind {
  const f = (filename ?? "").toLowerCase();
  const m = (mimeType ?? "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f)) return "screenshot";
  if (/receipt|invoice|order/i.test(text.slice(0, 400))) {
    if (/track|ups|fedex|usps|dhl|label/i.test(text)) return "shipping_label";
    if (/invoice|bill\s+to|amount\s+due/i.test(text)) return "invoice";
    return "receipt";
  }
  if (/track|1z[\w]/i.test(text)) return "shipping_label";
  return "generic";
}

function textToBlocks(text: string, baseConf: number): OcrBlock[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [{ text: text.trim() || "(empty)", confidence: baseConf * 0.5 }];
  }
  return lines.map((line, i) => ({
    text: line,
    confidence: Math.min(1, baseConf * (1 - i * 0.02)),
  }));
}

// ── Mock adapter ───────────────────────────────────────────────────────────

export class MockOcrProvider implements OCRProvider {
  readonly providerId = "mock-ocr@1.0";

  async extract(input: OcrInput): Promise<OcrExtraction> {
    const { textContent, imageBuffer, mimeType, filename } = input;

    if (textContent !== undefined && textContent.length > 0) {
      const kind = inferKind(filename, mimeType, textContent);
      const conf = 0.82;
      return {
        fullPlainText: textContent.trim(),
        blocks:        textToBlocks(textContent, conf),
        documentKind:  kind,
        overallConfidence: conf,
        languageHints: ["en"],
        notes: [
          "mock-ocr: pass-through of supplied text — no optical model invoked.",
        ],
      };
    }

    if (imageBuffer && imageBuffer.byteLength > 0) {
      const hash = fnv32(new Uint8Array(imageBuffer));
      const fakeLines = [
        `MOCK_OCR_LINE_${(hash & 0xff).toString(16).padStart(2, "0")}`,
        "Total: $0.00 (synthetic)",
        "Tracking: 000000000000",
      ];
      const full = fakeLines.join("\n");
      return {
        fullPlainText: full,
        blocks:        textToBlocks(full, 0.25),
        documentKind:  "screenshot",
        overallConfidence: 0.2,
        notes: [
          "mock-ocr: deterministic synthetic text from image bytes — not real OCR.",
        ],
      };
    }

    return {
      fullPlainText: "",
      blocks:        [],
      documentKind:  "unknown",
      overallConfidence: 0,
      notes:         ["mock-ocr: no text or image buffer supplied."],
    };
  }
}

export const defaultOcrProvider: OCRProvider = new MockOcrProvider();
