/** Audio bookkeeping of the hidden decoder page, free of browser APIs so it can be tested. */

export const RATE = 16_000;

/** Mean of the channels, as 16-bit samples. Samples outside -1..1 are clamped. */
export function mixToInt16(channels: readonly Float32Array[]): Int16Array {
  const n = channels[0]?.length ?? 0;
  const out = new Int16Array(n);
  const k = channels.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const c of channels) sum += c[i]!;
    out[i] = Math.max(-32768, Math.min(32767, Math.round((sum / k) * 32768)));
  }
  return out;
}
