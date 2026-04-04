/**
 * encryption.ts
 *
 * AES-256-GCM symmetric encryption for secrets stored at rest (e.g. Shopify
 * access tokens in ShopifyConnection.accessToken).
 *
 * Requires ENCRYPTION_KEY env var: a 64-character lowercase hex string
 * representing 32 random bytes. Generate with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Wire format: base64( IV(16) ‖ AuthTag(16) ‖ Ciphertext )
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm" as const;
const IV_BYTES       = 16;
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a UTF-8 plaintext string.
 * Returns a base64-encoded blob containing IV + AuthTag + Ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key    = getKey();
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypt a base64-encoded blob produced by `encrypt()`.
 * Throws if the ENCRYPTION_KEY is wrong or the blob is tampered (GCM auth failure).
 */
export function decrypt(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");

  const iv         = buf.subarray(0, IV_BYTES);
  const authTag    = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
