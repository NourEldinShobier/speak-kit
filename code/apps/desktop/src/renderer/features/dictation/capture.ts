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
  readonly #onPiece: ((pcm: Float32Array) => void) | undefined;
  readonly #pieceMax: number;
  #piece: Float32Array[] = [];
  #pieceLen = 0;

  /**
   * `keepMs` is the most pre-roll a recording can ask for. `pieces.onPiece` gets the samples of a running recording in order, in pieces of about `pieces.ms`
   * (the pre-roll comes with the first one, and `stop` hands over what is left), so they can be kept somewhere safe before the recording ends.
   */
  constructor(sampleRate: number, keepMs: number, pieces?: { onPiece: (pcm: Float32Array) => void; ms?: number }) {
    this.#rate = sampleRate;
    this.#ringMax = Math.round((sampleRate * keepMs) / 1000);
    this.#onPiece = pieces?.onPiece;
    this.#pieceMax = Math.round((sampleRate * (pieces?.ms ?? 1000)) / 1000);
  }

  #offer(chunk: Float32Array): void {
    if (!this.#onPiece || !chunk.length) return;
    this.#piece.push(chunk);
    this.#pieceLen += chunk.length;
    if (this.#pieceLen >= this.#pieceMax) this.#flushPiece();
  }

  #flushPiece(): void {
    if (!this.#onPiece || !this.#pieceLen) return;
    const pcm = join(this.#piece, this.#pieceLen);
    this.#piece = [];
    this.#pieceLen = 0;
    this.#onPiece(pcm);
  }

  get recording(): boolean {
    return this.#clip !== null;
  }

  push(chunk: Float32Array): void {
    if (this.#clip) {
      this.#clip.push(chunk);
      this.#offer(chunk);
    }
    this.#ring.push(chunk);
    this.#ringLen += chunk.length;
    while (this.#ring.length > 1 && this.#ringLen - this.#ring[0]!.length >= this.#ringMax) this.#ringLen -= this.#ring.shift()!.length;
  }

  /** Starts a recording that begins with the last `prerollMs` of what was heard. */
  start(prerollMs: number): void {
    const want = Math.round((this.#rate * prerollMs) / 1000);
    const joined = join(this.#ring, this.#ringLen);
    this.#clip = want > 0 && joined.length ? [joined.subarray(Math.max(0, joined.length - want))] : [];
    this.#piece = [];
    this.#pieceLen = 0;
    for (const part of this.#clip) this.#offer(part);
  }

  stop(): Recorded | null {
    const parts = this.#clip;
    this.#clip = null;
    if (!parts) return null;
    this.#flushPiece();
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
    this.#piece = [];
    this.#pieceLen = 0;
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
