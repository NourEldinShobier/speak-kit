import { MeetingSearch, type Line, type MeetingEntry, type NoteVersion } from "@speakkit/meetings";
import { clock, overlapping } from "./time";

/** Largest page a list or a search returns, and the page when none is asked for. */
export const LIST = { default: 20, max: 200 } as const;
export const SEARCH = { default: 10, max: 50 } as const;

/** What the reader needs of the meetings on disk. Nothing here writes. */
export interface MeetingsSource {
  entries: MeetingEntry[];
  transcript(id: string): Promise<Line[]>;
  notes(id: string): Promise<NoteVersion[]>;
}

export type Pick = { ok: true; entry: MeetingEntry } | { ok: false; message: string };

const live = (entries: readonly MeetingEntry[]) => entries.filter((e) => e.trashedAt === undefined).sort((a, b) => b.startedAt - a.startedAt);

/** A meeting by full id, by a prefix of at least 6 characters that names exactly one, or `latest`. */
export function pick(entries: readonly MeetingEntry[], ref: string): Pick {
  const all = live(entries);
  if (ref === "latest") return all[0] ? { ok: true, entry: all[0] } : { ok: false, message: "There are no meetings yet." };
  const exact = all.find((e) => e.id === ref);
  if (exact) return { ok: true, entry: exact };
  if (ref.length < 6) return { ok: false, message: `"${ref}" is too short: use at least 6 characters of the id, the whole id, or latest.` };
  const hits = all.filter((e) => e.id.startsWith(ref));
  if (hits.length === 1) return { ok: true, entry: hits[0]! };
  return { ok: false, message: hits.length ? `"${ref}" matches ${hits.length} meetings. Use more of the id.` : `No meeting has the id "${ref}".` };
}

export interface Slice {
  from?: number;
  to?: number;
  /** 1-based chapter of the notes. */
  chapter?: number;
}

export interface Shown {
  id: string;
  title: string;
  startedAt: number;
  durationSec: number;
  provider: string;
  status: string;
  summary: string | null;
  chapters: { n: number; start: number; title: string }[];
  /** The range the lines were cut to, in seconds. */
  range: { from: number; to: number | null } | null;
  lines: { start: number; end: number; who: string; text: string }[];
}

type Chapters = NoteVersion["chapters"];

/** The seconds a chapter covers: from its start to the next chapter's start (the last runs on). */
function chapterRange(chapters: Chapters, n: number): { from: number; to: number } | undefined {
  const c = chapters[n - 1];
  return c ? { from: c.start, to: chapters[n]?.start ?? Infinity } : undefined;
}

/** The range a slice asks for: its own, or the one a chapter covers. A chapter that does not exist is an error, not an empty read. */
function rangeOf(chapters: Chapters, slice: Slice): { from?: number; to?: number } | string {
  if (slice.chapter !== undefined) {
    const r = chapterRange(chapters, slice.chapter);
    if (r) return r;
    return chapters.length ? `This meeting has ${chapters.length} chapters; there is no chapter ${slice.chapter}.` : "This meeting has no chapters.";
  }
  if (slice.from !== undefined && slice.to !== undefined && slice.to <= slice.from) return "--to must be later than --from.";
  return { ...(slice.from !== undefined && { from: slice.from }), ...(slice.to !== undefined && { to: slice.to }) };
}

/** One meeting, with the latest notes and the lines inside the range. */
export async function show(src: MeetingsSource, entry: MeetingEntry, slice: Slice): Promise<{ ok: true; shown: Shown } | { ok: false; message: string }> {
  const notes = (await src.notes(entry.id)).at(-1);
  const chapters = notes?.chapters ?? [];
  const range = rangeOf(chapters, slice);
  if (typeof range === "string") return { ok: false, message: range };
  const lines = overlapping(await src.transcript(entry.id), range.from ?? 0, range.to ?? Infinity);
  const open = range.from === undefined && range.to === undefined;
  return {
    ok: true,
    shown: {
      id: entry.id,
      title: entry.title,
      startedAt: entry.startedAt,
      durationSec: entry.durationSec,
      provider: entry.providerName,
      status: entry.status,
      summary: notes?.summary ?? null,
      chapters: chapters.map((c, i) => ({ n: i + 1, start: c.start, title: c.title })),
      range: open ? null : { from: range.from ?? 0, to: range.to === undefined || range.to === Infinity ? null : range.to },
      lines: lines.map((l) => ({ start: l.start, end: l.end, who: l.who, text: l.text })),
    },
  };
}

const day = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

export function showMarkdown(s: Shown): string {
  const out = [`# ${s.title}`, "", `${day(s.startedAt)} · ${clock(s.durationSec)} · ${s.provider} · ${s.status} · ${s.id}`];
  if (s.summary) out.push("", "## Summary", "", s.summary);
  if (s.chapters.length) out.push("", "## Chapters", "", ...s.chapters.map((c) => `${c.n}. ${clock(c.start)} ${c.title}`));
  out.push("", s.range ? `## Transcript (${clock(s.range.from)} to ${s.range.to === null ? "end" : clock(s.range.to)})` : "## Transcript", "");
  out.push(...(s.lines.length ? s.lines.map((l) => `[${clock(l.start)}] ${l.who}: ${l.text.trim()}`) : ["Nothing was said in this range."]));
  return out.join("\n");
}

export const chaptersMarkdown = (s: Shown): string => (s.chapters.length ? s.chapters.map((c) => `${c.n}. ${clock(c.start)} ${c.title}`).join("\n") : "This meeting has no chapters.");

export interface Row {
  id: string;
  title: string;
  startedAt: number;
  durationSec: number;
  provider: string;
  status: string;
}

const rowOf = (e: MeetingEntry): Row => ({ id: e.id, title: e.title, startedAt: e.startedAt, durationSec: e.durationSec, provider: e.providerName, status: e.status });

export function list(entries: readonly MeetingEntry[], limit: number = LIST.default): Row[] {
  return live(entries)
    .slice(0, Math.min(LIST.max, Math.max(1, limit)))
    .map(rowOf);
}

export const listMarkdown = (rows: readonly Row[]): string =>
  rows.length ? rows.map((r) => `${r.id}  ${day(r.startedAt)}  ${clock(r.durationSec)}  ${r.provider}  ${r.title}`).join("\n") : "No meetings yet.";

export interface Hit extends Row {
  snippet: string;
}

/** Search over title, summary and words. Loads every transcript once; the index lives for this call only. */
export async function search(src: MeetingsSource, query: string, limit: number = SEARCH.default): Promise<Hit[]> {
  const entries = live(src.entries);
  const index = new MeetingSearch();
  for (const e of entries) {
    const [lines, notes] = await Promise.all([src.transcript(e.id), src.notes(e.id)]);
    index.set(e.id, { title: e.title, summary: notes.at(-1)?.summary ?? "", text: lines.map((l) => l.text).join(" ") });
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  return index.search(query, Math.min(SEARCH.max, Math.max(1, limit))).flatMap((h) => (byId.has(h.id) ? [{ ...rowOf(byId.get(h.id)!), snippet: h.snippet }] : []));
}

export const searchMarkdown = (hits: readonly Hit[]): string => (hits.length ? hits.map((h) => `${h.id}  ${h.title}\n    ${h.snippet.replace(/\s+/g, " ")}`).join("\n") : "Nothing found.");
