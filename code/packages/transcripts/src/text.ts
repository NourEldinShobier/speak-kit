import type { Segment } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** 83 -> "1:23", 3723 -> "1:02:03". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** The words only, one paragraph per segment: what Copy section puts on the clipboard. */
export const plainText = (segments: readonly Segment[]): string =>
  segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
