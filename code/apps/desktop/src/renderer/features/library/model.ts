import { compareNames } from "@speakkit/protocol";
import "../../../shared/i18n/packs/library";
import { englishT, ENGLISH_LANG, type Lang, type TFn } from "../../../shared/i18n";
import type { DocMeta } from "../../../shared/library/contract";

/** Speech at speed 1 reads about this many words a minute (15 characters a second, the player's estimate). */
const WORDS_PER_MINUTE = 150;

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "url", label: "Web pages" },
  { id: "file", label: "PDFs and files" },
  { id: "paste", label: "Pasted text" },
  { id: "unfinished", label: "Unfinished" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export const SORTS = [
  { id: "played", label: "Recently played" },
  { id: "added", label: "Recently added" },
  { id: "title", label: "Title" },
  { id: "length", label: "Longest first" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export const estimateMs = (words: number, speed: number) => (words / (WORDS_PER_MINUTE * speed)) * 60_000;

export { clock } from "@speakkit/protocol";

/** 2h 15m, 37 min, under 1 min */
export function span(ms: number, t: TFn = englishT): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return t("lib.spanUnder");
  const h = Math.floor(min / 60);
  return h ? t("lib.spanHours", { h, m: min % 60 }) : t("lib.spanMin", { n: min });
}

/** Today, Yesterday, Mon (within the last week), Oct 27 */
export function dayLabel(ts: number, now: number, { t, locale }: Lang = ENGLISH_LANG): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const diff = Math.round((day(now) - day(ts)) / 86_400_000);
  if (diff <= 0) return t("lib.today");
  if (diff === 1) return t("lib.yesterday");
  return new Intl.DateTimeFormat(locale, diff < 7 ? { weekday: "short" } : { month: "short", day: "numeric" }).format(ts);
}

const lastTouched = (d: DocMeta) => d.openedAt ?? d.addedAt;

export function filterDocs(docs: DocMeta[], filter: FilterId): DocMeta[] {
  if (filter === "all") return docs;
  if (filter === "unfinished") return docs.filter((d) => !d.finished);
  return docs.filter((d) => d.source === filter);
}

export function sortDocs(docs: DocMeta[], sort: SortId): DocMeta[] {
  const by: Record<SortId, (a: DocMeta, b: DocMeta) => number> = {
    played: (a, b) => lastTouched(b) - lastTouched(a),
    added: (a, b) => b.addedAt - a.addedAt,
    title: (a, b) => compareNames(a.title, b.title),
    length: (a, b) => b.wordCount - a.wordCount,
  };
  return [...docs].sort(by[sort]);
}

/** The reading to offer under "Continue listening": the most recently opened one that is started and not finished. */
export function continueDoc(docs: DocMeta[]): DocMeta | undefined {
  return sortDocs(
    docs.filter((d) => d.openedAt !== undefined && !d.finished && d.progress.fraction > 0),
    "played",
  )[0];
}

interface RowStatus {
  kind: "finished" | "new" | "progress";
  percent: number;
  /** "12% · 37 min left" */
  label: string;
}

export function rowStatus(d: DocMeta, speed: number, t: TFn = englishT): RowStatus {
  if (d.finished) return { kind: "finished", percent: 100, label: t("lib.finished") };
  if (d.openedAt === undefined && d.progress.fraction === 0) return { kind: "new", percent: 0, label: t("lib.new") };
  const percent = Math.round(d.progress.fraction * 100);
  return { kind: "progress", percent, label: t("lib.statusLeft", { percent, span: span(estimateMs(d.wordCount, speed) * (1 - d.progress.fraction), t) }) };
}

export const FORMAT_BADGE: Record<DocMeta["format"], string | null> = { pdf: "PDF", docx: "DOC", epub: "EPUB", markdown: "MD", html: "HTML", text: null, url: null };

export function subtitle(d: DocMeta, t: TFn = englishT): string {
  const base = d.source === "paste" ? t("lib.pastedText") : d.origin;
  return d.pages ? t("lib.sourcePages", { source: base, n: d.pages }) : base;
}

/** Split text around case-insensitive matches of every query word: [text, isMatch] pieces, for highlighting. */
export function highlightParts(text: string, query: string): [string, boolean][] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return [[text, false]];
  const parts: [string, boolean][] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(terms.join("|"), "gi"))) {
    if (m.index > last) parts.push([text.slice(last, m.index), false]);
    parts.push([m[0], true]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push([text.slice(last), false]);
  return parts;
}
