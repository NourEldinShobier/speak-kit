import { pickKeyframes, type Frame } from "../keyframes";
import type { Word } from "../narration";

import { MIN_TRIM_MS } from "../../../shared/capture/contract";

export { MIN_TRIM_MS };

export interface TrimRange {
  startMs: number;
  endMs: number;
}

/** The range to keep, cut to the recording (a little past its end is allowed, the recorder's clock runs on), or undefined when it is not a range of at least half a second. */
export function trimRange(startMs: number, endMs: number, durationMs: number | undefined): TrimRange | undefined {
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0) return undefined;
  const end = durationMs === undefined ? endMs : Math.min(endMs, durationMs);
  return end - startMs >= MIN_TRIM_MS ? { startMs, endMs: end } : undefined;
}

/** Words said inside the range. */
export const wordsIn = <T extends { startMs: number }>(words: readonly T[], r: TrimRange): T[] => words.filter((w) => w.startMs >= r.startMs && w.startMs < r.endMs);

/** The keyframes of what is kept: chosen again from the frames inside the range, so nothing that was cut away stays in the contact sheet or goes to the voice chat. A range with no frame keeps the one nearest its start. */
export function framesIn(frames: readonly Frame[], words: readonly Word[], r: TrimRange): Frame[] {
  const inside = frames.filter((f) => f.atMs >= r.startMs && f.atMs < r.endMs);
  if (inside.length) return pickKeyframes(inside, wordsIn(words, r)).frames;
  const nearest = [...frames].sort((a, b) => Math.abs(a.atMs - r.startMs) - Math.abs(b.atMs - r.startMs))[0];
  return nearest ? [nearest] : [];
}
