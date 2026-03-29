/**
 * DocumentProvider — interface for document extraction backends.
 *
 * The DocumentEvidenceAgent delegates structured extraction to a provider.
 *
 * Registered providers:
 *   - RegexDocumentProvider   (default — pure text pattern matching)
 *   - ClaudeDocumentProvider  (future — Claude for rich document understanding)
 *   - TextractProvider        (future — AWS Textract for native OCR)
 */

// ── Provider contract ─────────────────────────────────────────────────────────

export type DocumentExtraction = {
  /** Receipt or invoice document markers found */
  hasReceipt?: boolean;
  /** Carrier tracking number found */
  hasTrackingInfo?: boolean;
  trackingNumber?: string;
  /** Order or invoice total amount (USD) */
  invoiceAmount?: number;
  /** Number of line items on invoice/receipt */
  lineItemCount?: number;
  /** Reference to a policy, warranty, or returns terms */
  hasPolicyReference?: boolean;
  /** The raw extracted text (if provider supports it) */
  extractedText?: string;
  /** Provider confidence in the extraction, 0–1 */
  confidence?: number;
  notes?: string[];
};

export interface DocumentProvider {
  readonly providerId: string;
  extract(
    content: string,
    mimeType?: string,
    filename?: string,
  ): Promise<DocumentExtraction>;
}

// ── Regex-based provider ──────────────────────────────────────────────────────
// Works on plain text content. Sufficient for simple structured documents
// (shipping labels, basic receipts). Replace with Textract/Claude for PDFs.

const RECEIPT_RE   = /\b(receipt|invoice|order\s*[#№]?|order\s+number|purchase|total\s*:|subtotal\s*:|payment\s+received)\b/i;
const TRACKING_RE  = /\b(1Z[A-Z0-9]{16}|(\d{12,22})|(\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}))\b/;
const POLICY_RE    = /\b(return\s+policy|refund\s+policy|terms\s+(?:and\s+)?conditions|warranty|coverage|eligible\s+for\s+refund)\b/i;
const CURRENCY_RE  = /\$\s*(\d{1,6}(?:[.,]\d{2})?)/g;

export class RegexDocumentProvider implements DocumentProvider {
  readonly providerId = "regex@1.0";

  async extract(content: string): Promise<DocumentExtraction> {
    const hasReceipt       = RECEIPT_RE.test(content);
    const trackingMatch    = content.match(TRACKING_RE);
    const hasTrackingInfo  = trackingMatch !== null;
    const hasPolicyReference = POLICY_RE.test(content);

    // Extract all currency amounts and take the largest as the likely total
    const amounts: number[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(CURRENCY_RE.source, "g");
    while ((m = re.exec(content)) !== null) {
      const n = parseFloat(m[1].replace(",", "."));
      if (!isNaN(n)) amounts.push(n);
    }
    const invoiceAmount   = amounts.length > 0 ? Math.max(...amounts) : undefined;
    const lineItemCount   = amounts.length > 0 ? amounts.length - 1 : undefined; // largest is probably total

    return {
      hasReceipt,
      hasTrackingInfo,
      trackingNumber: trackingMatch?.[0],
      invoiceAmount,
      lineItemCount: lineItemCount && lineItemCount > 0 ? lineItemCount : undefined,
      hasPolicyReference,
      extractedText: content,
      confidence: 0.75,
      notes: ["regex provider — best-effort extraction from plain text."],
    };
  }
}

export const defaultDocumentProvider: DocumentProvider = new RegexDocumentProvider();
