/** Estimated speech rate for sentences not synthesized yet, chars per second at speed 1. */
export const CHARS_PER_SEC = 15;

/** Heard duration of each sentence: measured once synthesized, estimated from the text length until then. */
export class Timeline {
  private known: (number | undefined)[] = [];
  private texts: readonly { text: string }[] = [];

  private speed: () => number;

  constructor(speed: () => number) {
    this.speed = speed;
  }

  reset(sentences: readonly { text: string }[]): void {
    this.texts = sentences;
    this.known = sentences.map(() => undefined);
  }

  set(i: number, ms: number): void {
    this.known[i] = ms;
  }

  /** Forget the measured durations from sentence i on (they are requested again). */
  forget(i: number): void {
    for (let k = i; k < this.known.length; k++) this.known[k] = undefined;
  }

  durationMs(i: number): number {
    return this.known[i] ?? ((this.texts[i]?.text.length ?? 0) / (CHARS_PER_SEC * this.speed())) * 1000;
  }

  /** Start of sentence i in ms from the beginning of the document. */
  startMs(i: number): number {
    let t = 0;
    for (let k = 0; k < i; k++) t += this.durationMs(k);
    return t;
  }

  /** Position in the document: the start of sentence i plus the time already heard of it (clamped to its duration). */
  elapsedMs(i: number, heardMs: number): number {
    return this.startMs(i) + Math.max(0, Math.min(heardMs, this.durationMs(i)));
  }

  totalMs(): number {
    return this.startMs(this.texts.length);
  }
}

/** The sentence whose start is nearest `targetMs`, given each sentence's duration. */
export function nearestSentence(count: number, durationOf: (i: number) => number, targetMs: number): number {
  let best = 0,
    bestDist = Infinity,
    t = 0;
  for (let i = 0; i < count; i++) {
    const dist = Math.abs(t - targetMs);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
    t += durationOf(i);
  }
  return best;
}

/** First sentence of the next (dir 1) or of the previous (dir -1) paragraph; undefined when already in the last one. */
export function blockJump(sentences: readonly { block: number }[], idx: number, dir: 1 | -1): number | undefined {
  const block = sentences[idx]?.block ?? 0;
  if (dir === 1) {
    const n = sentences.findIndex((x, i) => i > idx && x.block > block);
    return n < 0 ? undefined : n;
  }
  let k = idx;
  while (k >= 0 && sentences[k]!.block >= block) k--; // last sentence of the previous paragraph
  if (k < 0) return 0;
  const pb = sentences[k]!.block;
  while (k > 0 && sentences[k - 1]!.block === pb) k--;
  return k;
}
