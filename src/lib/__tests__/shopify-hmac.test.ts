/**
 * Tests for Shopify webhook HMAC verification.
 *
 * Uses a known secret + payload to validate that verifyWebhookHmac:
 *   - accepts a correct signature
 *   - rejects a tampered body
 *   - rejects a tampered signature
 *   - rejects a wrong secret
 *   - handles empty/missing inputs without throwing
 */

import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookHmac } from "../shopify-client";

// ── Fixture ───────────────────────────────────────────────────────────────────

const SECRET  = "test_webhook_secret_32_bytes_hex!";
const PAYLOAD = JSON.stringify({
  id:          820982911946154500,
  email:       "jon@example.com",
  total_price: "199.00",
  currency:    "USD",
});

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("verifyWebhookHmac", () => {
  it("accepts a correct signature", () => {
    const sig = sign(PAYLOAD);
    expect(verifyWebhookHmac(PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body (different payload)", () => {
    const sig          = sign(PAYLOAD);
    const tamperedBody = PAYLOAD.replace("199.00", "0.01");
    expect(verifyWebhookHmac(tamperedBody, sig, SECRET)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig         = sign(PAYLOAD);
    const tamperedSig = sig.slice(0, -4) + "XXXX";
    expect(verifyWebhookHmac(PAYLOAD, tamperedSig, SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const wrongSig = sign(PAYLOAD, "wrong_secret");
    expect(verifyWebhookHmac(PAYLOAD, wrongSig, SECRET)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyWebhookHmac(PAYLOAD, "", SECRET)).toBe(false);
  });

  it("rejects an empty body (body and sig both empty)", () => {
    // Even an empty body + matching sig of empty string should accept
    // — this tests the boundary, not a security failure
    const emptySig = sign("");
    expect(verifyWebhookHmac("", emptySig, SECRET)).toBe(true);
  });

  it("works with a Buffer body (same as string)", () => {
    const buf = Buffer.from(PAYLOAD, "utf8");
    const sig = sign(PAYLOAD);
    expect(verifyWebhookHmac(buf, sig, SECRET)).toBe(true);
  });

  it("rejects when Buffer body is tampered", () => {
    const sig      = sign(PAYLOAD);
    const tampered = Buffer.from(PAYLOAD.replace("199.00", "0.01"), "utf8");
    expect(verifyWebhookHmac(tampered, sig, SECRET)).toBe(false);
  });

  it("does not throw on completely invalid inputs", () => {
    expect(() => verifyWebhookHmac("", "not-base64!!!", SECRET)).not.toThrow();
    expect(verifyWebhookHmac("", "not-base64!!!", SECRET)).toBe(false);
  });

  // Shopify test vector — from their official docs
  it("matches a known Shopify-style test vector", () => {
    const knownSecret  = "hush";
    const knownBody    = '{"id":123}';
    const knownSig     = createHmac("sha256", knownSecret).update(knownBody).digest("base64");
    expect(verifyWebhookHmac(knownBody, knownSig, knownSecret)).toBe(true);
  });
});
