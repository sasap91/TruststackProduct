const SIG_JPEG = [0xff, 0xd8, 0xff];
const SIG_PNG = [0x89, 0x50, 0x4e, 0x47];
const SIG_GIF = [0x47, 0x49, 0x46];
const SIG_WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const SIG_WEBP = [0x57, 0x45, 0x42, 0x50];

function match(sig: number[], bytes: Uint8Array, offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Returns a MIME type if bytes look like a supported raster image, else null. */
export function sniffImageMime(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 12) return null;
  const u = new Uint8Array(buffer);
  if (match(SIG_JPEG, u)) return "image/jpeg";
  if (match(SIG_PNG, u)) return "image/png";
  if (match(SIG_GIF, u)) return "image/gif";
  if (match(SIG_WEBP_RIFF, u, 0) && match(SIG_WEBP, u, 8)) return "image/webp";
  return null;
}
