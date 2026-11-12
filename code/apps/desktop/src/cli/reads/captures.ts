import { clock } from "./time";

/** The fields of a saved capture the command line shows (the app's own record has more). */
export interface CaptureRecord {
  id: string;
  kind: "recording" | "screenshot";
  title: string;
  at: number;
  dir: string;
  durationMs?: number;
  words?: { text: string; startMs: number; endMs: number }[];
  bytes: number;
  chips: ("copied" | "saved" | "sent")[];
  finishing?: boolean;
}

export type Pick = { ok: true; record: CaptureRecord } | { ok: false; message: string };

const newest = (list: readonly CaptureRecord[]) => [...list].sort((a, b) => b.at - a.at);

/** A capture by id, by its folder name, by a title that names exactly one, or `latest`. */
export function pick(list: readonly CaptureRecord[], ref: string): Pick {
  const all = newest(list);
  if (ref === "latest") return all[0] ? { ok: true, record: all[0] } : { ok: false, message: "There are no captures yet." };
  const hits = all.filter((r) => r.id === ref || r.dir === ref);
  if (hits.length === 1) return { ok: true, record: hits[0]! };
  const byTitle = all.filter((r) => r.title.toLowerCase() === ref.toLowerCase());
  if (byTitle.length === 1) return { ok: true, record: byTitle[0]! };
  return { ok: false, message: byTitle.length > 1 ? `"${ref}" names ${byTitle.length} captures. Use the id.` : `No capture is called "${ref}".` };
}

export interface CaptureRow {
  id: string;
  kind: string;
  title: string;
  at: number;
  durationMs: number | null;
  words: number;
  bytes: number;
  what: string[];
}

const rowOf = (r: CaptureRecord): CaptureRow => ({ id: r.id, kind: r.kind, title: r.title, at: r.at, durationMs: r.durationMs ?? null, words: r.words?.length ?? 0, bytes: r.bytes, what: r.chips });

export function list(records: readonly CaptureRecord[], limit = 20): CaptureRow[] {
  return newest(records)
    .filter((r) => !r.finishing)
    .slice(0, Math.min(200, Math.max(1, limit)))
    .map(rowOf);
}

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

export const listText = (rows: readonly CaptureRow[]): string =>
  rows.length ? rows.map((r) => `${r.id}  ${when(r.at)}  ${r.durationMs === null ? "screenshot" : clock(r.durationMs / 1000)}  ${r.words} words  ${r.title}`).join("\n") : "No captures yet.";

export interface CaptureShown extends CaptureRow {
  folder: string;
  /** What was said, in order, with the millisecond each line starts. */
  narration: { atMs: number; text: string }[];
}

/** One capture and its words, grouped into a line per second so a long narration stays readable. */
export function show(r: CaptureRecord, root: string): CaptureShown {
  const lines: { atMs: number; text: string }[] = [];
  for (const w of r.words ?? []) {
    const last = lines.at(-1);
    if (last && Math.floor(last.atMs / 1000) === Math.floor(w.startMs / 1000)) last.text += ` ${w.text}`;
    else lines.push({ atMs: w.startMs, text: w.text });
  }
  return { ...rowOf(r), folder: `${root}/${r.dir}`.replace(/\\/g, "/"), narration: lines };
}

export const showText = (s: CaptureShown): string =>
  [s.title, `${when(s.at)} · ${s.kind} · ${s.id}`, `Folder: ${s.folder}`, "", ...(s.narration.length ? s.narration.map((l) => `[${clock(l.atMs / 1000)}] ${l.text}`) : ["No narration."])].join("\n");
