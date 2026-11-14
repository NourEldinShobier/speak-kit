/** Audio bookkeeping of the two hidden pages, free of browser APIs so it can be tested. */

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

/** Loudness of a block, 0 to 1, for the level bars: RMS with a boost, because speech sits low in the range. */
export function levelOf(block: Float32Array): number {
  if (!block.length) return 0;
  let sum = 0;
  for (const x of block) sum += x * x;
  return Math.min(1, Math.sqrt(sum / block.length) * 6);
}

/** getUserMedia failures as the codes the recorder reports. */
export function micCode(error: unknown): "mic-denied" | "mic-missing" | "mic-busy" | "mic-failed" {
  switch ((error as { name?: string } | null)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "mic-denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "mic-missing";
    case "NotReadableError":
    case "AbortError":
      return "mic-busy";
    default:
      return "mic-failed";
  }
}

/** Collects samples and hands them over in pieces of at least `size`: one write to disk per second, not per 80 ms block. */
export class Batcher {
  readonly #size: number;
  #parts: Float32Array[] = [];
  #len = 0;

  constructor(size: number) {
    this.#size = size;
  }

  /** Returns the batch when this block completed one, else undefined. */
  push(block: Float32Array): Int16Array | undefined {
    this.#parts.push(block);
    this.#len += block.length;
    return this.#len >= this.#size ? this.flush() : undefined;
  }

  /** Whatever is held, as 16-bit samples; empty when nothing is. */
  flush(): Int16Array | undefined {
    if (!this.#len) return undefined;
    const joined = new Float32Array(this.#len);
    let at = 0;
    for (const p of this.#parts) {
      joined.set(p, at);
      at += p.length;
    }
    this.#parts = [];
    this.#len = 0;
    return mixToInt16([joined]);
  }
}
