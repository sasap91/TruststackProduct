import { describe, it, expect } from "vitest";
import {
  buildDocumentExcerpt,
  detectDelimiter,
  extractFromDelimitedText,
  extractFromStructuredJson,
  parseDelimitedLine,
} from "@/app/api/parse-claim/route";

describe("parse-claim normalization", () => {
  it("extracts fields from a messy JSON array of rows", () => {
    const result = extractFromStructuredJson([
      { "Claim Description": "", "Refund History": "0.18" },
      { notes: "Package arrived damaged", "Video Evidence": "yes", "order status": "delivered" },
    ]);

    expect(result.method).toBe("json-array");
    expect(result.fields.claimText).toBe("Package arrived damaged");
    expect(result.fields.deliveryStatus).toBe("delivered_intact");
    expect(result.fields.refundRate).toBe(0.18);
    expect(result.fields.hasVideoProof).toBe(true);
  });

  it("extracts fields across arbitrary CSV headers and multiple rows", () => {
    const result = extractFromDelimitedText(
      [
        'case_id,refund history,delivery status,extra',
        '1,0.25,not delivered,ignored',
        '2,,delivered,still ignored',
      ].join("\n"),
    );

    expect(result.method).toBe("csv");
    expect(result.fields.refundRate).toBe(0.25);
    expect(result.fields.deliveryStatus).toBe("not_delivered");
  });

  it("detects tab-delimited data and parses quoted cells", () => {
    expect(detectDelimiter('a\tb\tc')).toBe("\t");
    expect(parseDelimitedLine('"a,b"\t"c""d"', "\t")).toEqual(["a,b", 'c"d']);
  });

  it("truncates long document excerpts safely", () => {
    const excerpt = buildDocumentExcerpt("x".repeat(5005));
    expect(excerpt).toContain("[truncated 1005 chars]");
    expect(excerpt.length).toBeLessThan(4100);
  });
});
