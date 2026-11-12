/** Audio bookkeeping of the microphone window, free of browser APIs so it can be tested: a ring of the latest samples, and the recording that starts from it. */

export interface Recorded {
  pcm: Float32Array;
  peak: number;
}

export class ClipBuffer {
  readonly #rate: number;
  readonly #ringMax: number;
  #ring: Float32Array[] = [];
  #ringLen = 0;
  #clip: Float32Array[] | null = null;

  /** `keepMs` is the most pre-roll a recording can ask for. */
  constructor(sampleRate: number, keepMs: number) {
    this.#rate = sampleRate;
    this.#ringMax = Math.round((sampleRate * keepMs) / 1000);
  }

  get recording(): boolean {
    return this.#clip !== null;
  }

  push(chunk: Float32Array): void {
    if (this.#clip) this.#clip.push(chunk);
    this.#ring.push(chunk);
    this.#ringLen += chunk.length;
    while (this.#ring.length > 1 && this.#ringLen - this.#ring[0]!.length >= this.#ringMax) this.#ringLen -= this.#ring.shift()!.length;
  }

  /** Starts a recording that begins with the last `prerollMs` of what was heard. */
  start(prerollMs: number): void {
    const want = Math.round((this.#rate * prerollMs) / 1000);
    const joined = join(this.#ring, this.#ringLen);
    this.#clip = want > 0 && joined.length ? [joined.subarray(Math.max(0, joined.length - want))] : [];
  }

  stop(): Recorded | null {
    const parts = this.#clip;
    this.#clip = null;
    if (!parts) return null;
    const pcm = join(
      parts,
      parts.reduce((n, p) => n + p.length, 0),
    );
    let peak = 0;
    for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    return { pcm, peak };
  }

  discard(): void {
    this.#clip = null;
  }

  /** Forgets the ring (the microphone closed), so the next recording has no pre-roll from before. */
  clear(): void {
    this.#ring = [];
    this.#ringLen = 0;
  }
}

function join(parts: readonly Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** getUserMedia failures as the codes dictation reports. */
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
