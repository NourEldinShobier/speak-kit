/** Audio bookkeeping of the hidden recorder page, free of browser APIs so it can be tested. */

export const RATE = 16_000;

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

const toInt16 = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32768)));

/** Collects samples and hands them over in pieces of at least `size`: one message per second, not per 80 ms block. */
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

  /** Whatever is held, as 16-bit samples; undefined when nothing is. */
  flush(): Int16Array | undefined {
    if (!this.#len) return undefined;
    const out = new Int16Array(this.#len);
    let at = 0;
    for (const p of this.#parts) for (const x of p) out[at++] = toInt16(x);
    this.#parts = [];
    this.#len = 0;
    return out;
  }
}
