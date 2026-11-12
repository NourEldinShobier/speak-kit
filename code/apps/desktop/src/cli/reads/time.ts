/** Seconds from "90", "90.5", "1:30" or "1:02:03"; undefined for anything else (a minute or second of 60 or more, a sign, words). */
export function parseOffset(text: string): number | undefined {
  const t = text.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^(?:(\d+):)?([0-5]?\d):([0-5]\d(?:\.\d+)?)$/.exec(t);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** 83 -> "01:23", 3723 -> "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

/** The lines that overlap the range [from, to); an open end is the start or the end of the meeting. */
export function overlapping<T extends { start: number; end: number }>(lines: readonly T[], from = 0, to = Infinity): T[] {
  return lines.filter((l) => l.end > from && l.start < to);
}
