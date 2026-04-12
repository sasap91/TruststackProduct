/**
 * TrustStack deterministic pipeline — evidence document parser.
 *
 * No LLM. Determines document type from URL patterns and file extensions.
 * Returns ParsedDocument records with the URL and detected type; the
 * extractedText field is left empty here and populated by the text LLM step.
 */

import type { ParsedDocument } from "../types/signals";

// ── Doc-type detection ────────────────────────────────────────────────────────

const DOC_TYPE_RULES: Array<{
  type: ParsedDocument["docType"];
  patterns: RegExp[];
}> = [
  {
    type: "receipt",
    patterns: [
      /receipt/i,
      /invoice/i,
      /order[-_]?confirm/i,
      /payment[-_]?confirm/i,
      /purchase[-_]?order/i,
      /\.(pdf)$/i,
    ],
  },
  {
    type: "tracking",
    patterns: [
      /track/i,
      /shipment/i,
      /shipping[-_]?label/i,
      /delivery[-_]?confirm/i,
      /usps|fedex|ups|dhl|royal[-_]?mail|australia[-_]?post/i,
    ],
  },
  {
    type: "photo",
    patterns: [
      /\.(jpe?g|png|webp|gif|bmp|heic|tiff?)(\?|$)/i,
      /photo/i,
      /image/i,
      /img[-_]/i,
      /picture/i,
      /screenshot/i,
    ],
  },
  {
    type: "correspondence",
    patterns: [
      /email/i,
      /message/i,
      /correspondence/i,
      /chat[-_]?log/i,
      /ticket/i,
      /support[-_]?thread/i,
      /communication/i,
    ],
  },
];

export function detectDocType(url: string): ParsedDocument["docType"] {
  for (const { type, patterns } of DOC_TYPE_RULES) {
    if (patterns.some((re) => re.test(url))) return type;
  }
  return "other";
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a list of evidence URLs into ParsedDocument stubs.
 *
 * extractedText is empty — the text LLM step populates it from the claim
 * description and document context.
 * anomalies is empty — the text LLM step populates it.
 */
export function parseDocuments(urls: string[]): ParsedDocument[] {
  return urls.map((url) => ({
    url,
    docType: detectDocType(url),
    extractedText: "",
    anomalies:     [],
  }));
}
