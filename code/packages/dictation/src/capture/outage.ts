import type { Unsubscribe } from "../types";

/** Exactly-zero audio for this long means the system is handing over silence. */
export const ZERO_MS = 3000;

/**
 * Watches the blocks coming from the microphone. Real silence has noise; blocks of exact zeros mean the microphone is muted or blocked.
 * It reports "silent" once per outage, and "ok" when real audio returns after a report.
 */
export function createSilenceWatch(): { feed(allZero: boolean, durationMs: number): "silent" | "ok" | undefined } {
  let zeroMs = 0;
  let reported = false;
  return {
    feed(allZero, durationMs) {
      if (!allZero) {
        zeroMs = 0;
        const was = reported;
        reported = false;
        return was ? "ok" : undefined;
      }
      zeroMs += durationMs;
      if (zeroMs < ZERO_MS || reported) return undefined;
      reported = true;
      return "silent";
    },
  };
}

export interface ReopenDeps {
  /** Tries to open the microphone again; true when it works. */
  open(): Promise<boolean>;
  after(ms: number, fn: () => void): Unsubscribe;
  /** One "reopening" per outage, then "recovered" or "gave-up". */
  onEvent(e: { type: "reopening"; attempt: number } | { type: "gave-up" } | { type: "recovered" }): void;
  baseMs?: number;
  maxMs?: number;
  limit?: number;
}

/**
 * Reopens a microphone that went away (unplugged, headset dropped) with growing waits between tries. One outage gives one "reopening" report, not one
 * per try, and after the limit it says it gave up instead of staying in a half-open state.
 */
export function createReopener(deps: ReopenDeps): { run(): void; cancel(): void } {
  const { baseMs = 500, maxMs = 8000, limit = 6 } = deps;
  let attempt = 0;
  let cancel: Unsubscribe | undefined;
  let running = false;
  const finish = (e: { type: "gave-up" } | { type: "recovered" }) => {
    running = false;
    attempt = 0;
    deps.onEvent(e);
  };
  const step = () => {
    cancel = deps.after(Math.min(maxMs, baseMs * 2 ** attempt), async () => {
      attempt++;
      let ok = false;
      try {
        ok = await deps.open();
      } catch {
        // A throwing open counts as a failed try.
      }
      if (!running) return;
      if (ok) finish({ type: "recovered" });
      else if (attempt >= limit) finish({ type: "gave-up" });
      else step();
    });
  };
  return {
    run() {
      if (running) return;
      running = true;
      attempt = 0;
      deps.onEvent({ type: "reopening", attempt: 1 });
      step();
    },
    cancel() {
      running = false;
      cancel?.();
    },
  };
}

/** Appends silence for a gap in the audio when the gap is short, so the words around it do not run together; a longer gap is left as it is. */
/** Longest gap that is filled. */
const MAX_GAP_MS = 200;

export function fillGap(before: Float32Array, gapSamples: number, sampleRate: number): Float32Array {
  if (gapSamples <= 0 || (gapSamples * 1000) / sampleRate >= MAX_GAP_MS) return before;
  const out = new Float32Array(before.length + gapSamples);
  out.set(before);
  return out;
}

/** Margins kept around a dropped pause. */
export const PAUSE_KEEP_BEFORE_MS = 2500;
export const PAUSE_KEEP_AFTER_MS = 300;

const FRAME_MS = 20;
const QUIET_LEVEL = 0.01;

/** One flag per 20 ms frame: true when its level (average removed) is under the threshold. */
function quietFrames(pcm: Float32Array, frame: number): boolean[] {
  const quiet: boolean[] = [];
  for (let at = 0; at < pcm.length; at += frame) {
    const block = pcm.subarray(at, at + frame);
    let mean = 0;
    for (const x of block) mean += x;
    mean /= block.length;
    let sum = 0;
    for (const x of block) sum += (x - mean) ** 2;
    quiet.push(Math.sqrt(sum / block.length) < QUIET_LEVEL);
  }
  return quiet;
}

/** Marks the frames to drop: inside each quiet run, all but 0.3 s after the speech and 2.5 s before the next (a run at an edge has speech on one side only). */
function framesToDrop(quiet: boolean[]): boolean[] {
  const keepAfter = Math.round(PAUSE_KEEP_AFTER_MS / FRAME_MS);
  const keepBefore = Math.round(PAUSE_KEEP_BEFORE_MS / FRAME_MS);
  const drop = quiet.map(() => false);
  for (let i = 0; i < quiet.length;) {
    if (!quiet[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < quiet.length && quiet[j]) j++;
    const from = i === 0 ? 0 : i + keepAfter;
    const to = j === quiet.length ? j : j - keepBefore;
    for (let k = from; k < to; k++) drop[k] = true;
    i = j;
  }
  return drop;
}

/** Drops the middle of long pauses before decoding. Returns the shortened audio and how much was dropped. */
export function skipPauses(pcm: Float32Array, sampleRate: number): { pcm: Float32Array; droppedMs: number } {
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const drop = framesToDrop(quietFrames(pcm, frame));
  const parts = drop.flatMap((d, i) => (d ? [] : [pcm.subarray(i * frame, (i + 1) * frame)]));
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return { pcm: out, droppedMs: (drop.length - parts.length) * FRAME_MS };
}
