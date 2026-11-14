import type { Word } from "../narration";

export interface Frame {
  atMs: number;
  file: string;
}

export interface KeyframePlan {
  frames: Frame[];
  /** Frames chosen because a spoken cue pointed at them. */
  cues: { word: string; atMs: number; frame: Frame }[];
}

export const MAX_KEYFRAMES = 12;
export const MAX_SIDE_PX = 1280;

/** Words that point at something on the screen. */
const CUE = /^(this|that|these|those|here|there)$/i;
const CUE_PAIR = /^(one|ones|button|field|part|thing|menu|line|row|area)$/i;

function nearest(frames: readonly Frame[], atMs: number): Frame {
  let best = frames[0]!;
  for (const f of frames) if (Math.abs(f.atMs - atMs) < Math.abs(best.atMs - atMs)) best = f;
  return best;
}

/**
 * Picks at most `max` frames for the agent: the frame nearest each pointing cue ("this one", "here"), then evenly spaced frames to fill, always
 * including the first and last. Frames are sorted by time; the same frame is never chosen twice.
 */
export function pickKeyframes(frames: readonly Frame[], words: readonly Word[], max = MAX_KEYFRAMES): KeyframePlan {
  if (!frames.length || max < 1) return { frames: [], cues: [] };
  const sorted = [...frames].sort((a, b) => a.atMs - b.atMs);
  const chosen = new Map<number, Frame>();
  const cues: KeyframePlan["cues"] = [];
  const cap = Math.min(max, sorted.length);
  const add = (f: Frame) => chosen.set(f.atMs, f);
  words.forEach((w, i) => {
    const bare = w.text.replace(/[^\p{L}]/gu, "");
    const next = words[i + 1]?.text.replace(/[^\p{L}]/gu, "") ?? "";
    // "here" and "there" point on their own; "this" and "that" point when a noun follows ("this one", "that button").
    const points = /^(here|there)$/i.test(bare) || (CUE.test(bare) && CUE_PAIR.test(next));
    if (!points || chosen.size >= cap) return;
    const frame = nearest(sorted, w.startMs);
    add(frame);
    cues.push({ word: w.text, atMs: w.startMs, frame });
  });
  const fill = [sorted[0]!, sorted[sorted.length - 1]!];
  for (let i = 1; i < cap - 1; i++) fill.push(sorted[Math.round((i * (sorted.length - 1)) / (cap - 1))]!);
  for (const f of fill) if (chosen.size < cap) add(f);
  return { frames: [...chosen.values()].sort((a, b) => a.atMs - b.atMs), cues: cues.filter((c) => chosen.has(c.frame.atMs)) };
}

export interface SheetPlan {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
}

/** Layout of the contact sheet: as square as the count allows, every cell keeps the aspect of the screen, and the sheet stays inside `maxSide`. */
export function contactSheetPlan(count: number, aspect: number, maxSide = MAX_SIDE_PX): SheetPlan {
  const n = Math.max(1, Math.min(count, MAX_KEYFRAMES));
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  const columns = Math.ceil(Math.sqrt(n * a));
  const rows = Math.ceil(n / columns);
  const cellWidth = Math.floor(Math.min(maxSide / columns, (maxSide * a) / rows));
  const cellHeight = Math.floor(cellWidth / a);
  return { columns, rows, cellWidth, cellHeight, width: columns * cellWidth, height: rows * cellHeight };
}

/** Largest size that fits `maxSide` on its long side, never enlarging. */
export function fitSize(width: number, height: number, maxSide = MAX_SIDE_PX): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
