import { STREAM_LIMITS } from "@speakkit/protocol";

/** A stretch of speech cut from the audio that came in, with where it starts in the stream. */
export interface Segment {
  pcm: Int16Array;
  startMs: number;
  endMs: number;
}

const { sampleRate: RATE, maxSegmentMs, minSegmentMs, pauseMs } = STREAM_LIMITS;
const FRAME_MS = 30;
const FRAME = (RATE * FRAME_MS) / 1000;
/** Mean level (of 32768) under which a frame is silence. */
const QUIET = 0.01;
/** Silence kept in front of speech so the first word is not clipped. */
const LEAD_MS = 300;
/** The shortest stretch worth sending to the engine when the stream ends. */
const MIN_TAIL_MS = 150;

const level = (f: Int16Array): number => {
  let sum = 0;
  for (const s of f) sum += Math.abs(s);
  return sum / f.length / 32768;
};

const join = (parts: Int16Array[]): Int16Array => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/**
 * Cuts a stream of audio into segments at pauses. A segment ends when speech has paused for `pauseMs` (and the segment is at least `minSegmentMs` long)
 * or when it reaches `maxSegmentMs`. Silence before the first word is dropped except for a short lead; a stretch with no speech in it is never returned.
 * Audio is taken in 30 ms frames; a partial frame waits for the next push.
 */
export class Segmenter {
  #rest = new Int16Array(0);
  #frames: Int16Array[] = [];
  #startFrame = 0;
  #seen = 0;
  #speech = false;
  #quiet = 0;

  push(pcm: Int16Array): Segment[] {
    const all = join([this.#rest, pcm]);
    const out: Segment[] = [];
    let at = 0;
    for (; at + FRAME <= all.length; at += FRAME) {
      const cut = this.#frame(all.subarray(at, at + FRAME));
      if (cut) out.push(cut);
    }
    this.#rest = all.slice(at);
    return out;
  }

  /** The stretch still open when the stream ends, if it holds speech. */
  flush(): Segment[] {
    if (this.#rest.length) {
      this.#frames.push(this.#rest);
      this.#seen += this.#rest.length / FRAME;
      this.#rest = new Int16Array(0);
    }
    const open = this.#speech && this.#frames.length * FRAME_MS >= MIN_TAIL_MS ? [this.#take()] : [];
    this.#reset();
    return open;
  }

  #frame(f: Int16Array): Segment | undefined {
    const loud = level(f) >= QUIET;
    this.#seen++;
    if (!this.#speech && !loud) {
      // Leading silence: keep only the last LEAD_MS of it.
      this.#frames.push(f);
      if (this.#frames.length * FRAME_MS > LEAD_MS) {
        this.#frames.shift();
        this.#startFrame++;
      }
      return undefined;
    }
    this.#frames.push(f);
    this.#speech = true;
    this.#quiet = loud ? 0 : this.#quiet + 1;
    const ms = this.#frames.length * FRAME_MS;
    const paused = this.#quiet * FRAME_MS >= pauseMs && ms >= minSegmentMs;
    if (!paused && ms < maxSegmentMs) return undefined;
    const seg = this.#take();
    this.#reset();
    return seg;
  }

  #take(): Segment {
    const startMs = this.#startFrame * FRAME_MS;
    return { pcm: join(this.#frames), startMs, endMs: startMs + this.#frames.length * FRAME_MS };
  }

  #reset(): void {
    this.#frames = [];
    this.#startFrame = this.#seen;
    this.#speech = false;
    this.#quiet = 0;
  }
}
