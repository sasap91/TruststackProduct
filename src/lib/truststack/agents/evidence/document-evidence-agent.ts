/**
 * DocumentEvidenceAgent
 *
 * Analyzes document artifacts: receipts, invoices, shipping labels, policy
 * screenshots, and any supporting text-based documentation.
 *
 * OCR runs first (OCRProvider) to normalize text from scans or pasted content;
 * structured fields are then parsed by DocumentProvider (default: regex-based).
 *
 * Emitted signals:
 *   receipt_present           — a receipt or invoice document was identified
 *   tracking_info_present     — a valid carrier tracking number was found
 *   policy_document_reference — policy / warranty / returns terms mentioned
 *   invoice_mismatch          — claim context suggests amount discrepancy
 */

import type { Agent } from "../index";
import type { ArtifactAnalysis } from "../../types/artifact";
import type { NormalizedSignal } from "../../types/signal";
import type { DocumentProvider } from "../../providers/document-provider";
import { defaultDocumentProvider } from "../../providers/document-provider";
import type { OCRProvider } from "../../providers/ocr-provider";
import { defaultOcrProvider } from "../../providers/ocr-provider";
import { signal, EXTRACTOR } from "./shared";

export type DocumentEvidenceInput = {
  artifactId: string;
  /** Plain-text content of the document (pre-extracted or native text) */
  content: string;
  filename?: string;
  mimeType?: string;
  /**
   * Claim amount from the case metadata (for invoice_mismatch detection).
   * Pass undefined if not available.
   */
  claimedAmountUsd?: number;
  /** Optional scan / photo bytes for OCR (mock OCR produces synthetic lines) */
  documentBuffer?: ArrayBuffer;
};

export type DocumentEvidenceOutput = {
  analysis: ArtifactAnalysis;
  signals: NormalizedSignal[];
};

export class DocumentEvidenceAgent
  implements Agent<DocumentEvidenceInput, DocumentEvidenceOutput>
{
  readonly agentId = "document-evidence-agent";
  readonly version = "1.1.0";

  constructor(
    private readonly provider: DocumentProvider = defaultDocumentProvider,
    private readonly ocr: OCRProvider = defaultOcrProvider,
  ) {}

  async run(input: DocumentEvidenceInput): Promise<DocumentEvidenceOutput> {
    const { artifactId, content, filename, mimeType, claimedAmountUsd, documentBuffer } =
      input;
    const start = Date.now();

    const ocrOut = await this.ocr.extract({
      textContent: content,
      imageBuffer: documentBuffer,
      mimeType,
      filename,
    });

    const extraction = await this.provider.extract(
      ocrOut.fullPlainText,
      mimeType,
      filename,
    );
    const conf       = extraction.confidence ?? 0.7;
    const signals: NormalizedSignal[] = [];

    // ── Signal: receipt_present ───────────────────────────────────────────
    signals.push(signal({
      key: "receipt_present",
      value: extraction.hasReceipt
        ? "Receipt or invoice document identified"
        : "No receipt or invoice markers found",
      flag:       extraction.hasReceipt ? "clean" : "neutral",
      weight:     "high",
      confidence: conf,
      artifactId,
      modality:   "document",
      extractor:  EXTRACTOR.document,
      rationale:  extraction.hasReceipt
        ? "Document contains receipt or invoice markers — supports the claim."
        : "Document does not appear to be a receipt or invoice.",
    }));

    // ── Signal: tracking_info_present ────────────────────────────────────
    signals.push(signal({
      key: "tracking_info_present",
      value: extraction.hasTrackingInfo
        ? `Tracking number found: ${extraction.trackingNumber ?? "present"}`
        : "No tracking number found in document",
      flag:       extraction.hasTrackingInfo ? "clean" : "neutral",
      weight:     "medium",
      confidence: extraction.hasTrackingInfo ? 0.95 : conf, // regex match is high-confidence
      artifactId,
      modality:   "document",
      extractor:  EXTRACTOR.document,
      rationale:  extraction.hasTrackingInfo
        ? "Carrier tracking number present — can be cross-referenced with logistics data."
        : "No tracking number found — logistics cross-check not possible from this document.",
    }));

    // ── Signal: policy_document_reference ────────────────────────────────
    signals.push(signal({
      key: "policy_document_reference",
      value: extraction.hasPolicyReference
        ? "Policy or warranty terms referenced in document"
        : "No policy or warranty terms referenced",
      flag:       extraction.hasPolicyReference ? "neutral" : "clean",
      weight:     "low",
      confidence: conf,
      artifactId,
      modality:   "document",
      extractor:  EXTRACTOR.document,
      rationale:  extraction.hasPolicyReference
        ? "Document references policy or warranty terms — may indicate coached submission."
        : "No policy/warranty language found in document.",
    }));

    // ── Signal: invoice_mismatch ──────────────────────────────────────────
    signals.push(this.invoiceMismatchSignal(
      artifactId,
      extraction.invoiceAmount,
      claimedAmountUsd,
      conf,
    ));

    const analysis: ArtifactAnalysis = {
      artifactId,
      agentId:     this.agentId,
      modelId:     `${this.ocr.providerId}→${this.provider.providerId}`,
      provider:    undefined,
      rawScore:    undefined,
      notes:       [...(ocrOut.notes ?? []), ...(extraction.notes ?? [])],
      durationMs:  Date.now() - start,
      completedAt: new Date(),
    };

    return { analysis, signals };
  }

  private invoiceMismatchSignal(
    artifactId: string,
    invoiceAmount: number | undefined,
    claimedAmount: number | undefined,
    conf: number,
  ): NormalizedSignal {
    if (invoiceAmount === undefined) {
      return signal({
        key:       "invoice_mismatch",
        value:     "No invoice amount found — mismatch check not possible",
        flag:      "neutral",
        weight:    "medium",
        confidence: 0.5,
        artifactId,
        modality:  "document",
        extractor: EXTRACTOR.document,
        rationale: "Document does not contain a parseable monetary amount.",
      });
    }

    if (claimedAmount === undefined) {
      return signal({
        key:        "invoice_mismatch",
        value:      `Invoice amount $${invoiceAmount.toFixed(2)} — no claim amount to compare`,
        flag:       "neutral",
        weight:     "medium",
        confidence: conf,
        rawScore:   invoiceAmount,
        artifactId,
        modality:   "document",
        extractor:  EXTRACTOR.document,
        rationale:  "Invoice amount found but no claim amount was provided for comparison.",
      });
    }

    const ratio     = claimedAmount / invoiceAmount;
    const mismatch  = ratio > 1.2 || ratio < 0.8; // > 20% discrepancy
    const pctDiff   = Math.round(Math.abs(ratio - 1) * 100);

    return signal({
      key:        "invoice_mismatch",
      value: mismatch
        ? `Invoice $${invoiceAmount.toFixed(2)} vs claim $${claimedAmount.toFixed(2)} (${pctDiff}% discrepancy)`
        : `Invoice and claim amounts consistent ($${invoiceAmount.toFixed(2)})`,
      flag:       mismatch ? "risk" : "clean",
      weight:     "high",
      rawScore:   ratio,
      confidence: Math.min(0.9, conf),
      artifactId,
      modality:   "document",
      extractor:  EXTRACTOR.document,
      rationale:  mismatch
        ? `Claimed amount differs from invoice by ${pctDiff}% — warrants review.`
        : "Claimed amount is consistent with the invoice.",
    });
  }
}

export const documentEvidenceAgent = new DocumentEvidenceAgent();
