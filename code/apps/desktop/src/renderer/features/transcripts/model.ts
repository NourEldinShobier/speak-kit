import type { Row } from "@speakkit/transcripts/pure";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

/** 38 min, 1 h 12 min, 1 min (never 0), 45 s for a very short one. */
export function lengthText(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const hhmm = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;

/** "Today, 2:10 PM", "Yesterday, 4:30 PM", "Nov 9" (with the year when it is not this year). */
export function dateText(at: number, now: number): string {
  const d = new Date(at);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days === 0) return `Today, ${hhmm(d)}`;
  if (days === 1) return `Yesterday, ${hhmm(d)}`;
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** Under a row's date: "Removed in 29 days" or "Removed today". */
export function removedText(daysLeft: number): string {
  if (daysLeft === 0) return "Removed today";
  return `Removed in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}

/** 148 MB, 1.2 GB, 12 KB. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || Number.isInteger(n) ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export interface Progress {
  label: string;
  /** 0..1, or null when it cannot be told (waiting). */
  fraction: number | null;
}

/** What a row that is not finished says and how far it is. */
export function progressOf(r: Pick<Row, "status" | "chunksDone" | "chunksTotal" | "durationSec" | "queued">): Progress | null {
  switch (r.status) {
    case "queued":
      return { label: r.queued && r.queued > 1 ? `Waiting, number ${r.queued} in line` : "Waiting for the speech engine", fraction: 0 };
    case "transcribing": {
      const f = r.chunksTotal ? r.chunksDone / r.chunksTotal : 0;
      const min = Math.floor((r.durationSec * f) / 60);
      return { label: r.chunksTotal ? `${min} of ${Math.max(1, Math.round(r.durationSec / 60))} min transcribed` : "Preparing", fraction: f };
    }
    default:
      return null;
  }
}

export interface Piece {
  text: string;
  hit: boolean;
  /** Index among all matches of the transcript (for the current-match highlight). */
  n?: number;
}

/** A segment's text cut into plain and matched pieces. `ranges` are character ranges inside `text`; `firstN` is the number of the first range among all matches. */
export function pieces(text: string, ranges: readonly { from: number; to: number }[], firstN: number): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (r.from > at) out.push({ text: text.slice(at, r.from), hit: false });
    out.push({ text: text.slice(r.from, r.to), hit: true, n: firstN + i });
    at = r.to;
  });
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

/** "2 of 4" for the search inside a transcript, "No matches" when there are none. */
export const matchText = (current: number, total: number): string => (total === 0 ? "No matches" : `${current + 1} of ${total}`);

/** The words of a search found in a stretch of text, for the snippet under a result: every typed word, case ignored, wherever it starts a word. */
export function marked(text: string, query: string): Piece[] {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!terms?.length) return text ? [{ text, hit: false }] : [];
  const re = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${terms.join("|")})[\p{L}\p{N}]*`, "giu");
  const ranges = [...text.matchAll(re)].map((m) => ({ from: m.index, to: m.index + m[0].length }));
  return pieces(text, ranges, 0);
}

/** The names of the transcript languages; Auto picks the language from the audio. */
export const LANGUAGES: Record<string, string> = { auto: "Auto-detect", en: "English", de: "German", ar: "Arabic" };
