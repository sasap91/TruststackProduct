/** Deterministic pseudo-scores for UI/dev only — not forensic signal. */
export function demoProbabilityFromBytes(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer.byteLength > 8192 ? buffer.slice(0, 8192) : buffer);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  const x = (h >>> 0) / 0xffffffff;
  const v = 0.12 + 0.76 * (0.5 + 0.5 * Math.sin(x * Math.PI * 11));
  return clamp01(v);
}

export function demoProbabilityFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = (h >>> 0) / 0xffffffff;
  const v = 0.12 + 0.76 * (0.5 + 0.5 * Math.cos(x * Math.PI * 7));
  return clamp01(v);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
