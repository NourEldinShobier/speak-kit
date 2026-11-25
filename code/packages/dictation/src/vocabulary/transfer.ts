import { exeKey } from "../paste-plan";
import { cleanSounds, MAX_HEARD, MAX_WORD, mergeTerm, sameText, type Term, type TermError, type TermInput } from "./terms";

export interface Vocabulary {
  terms: Term[];
}
export type ExportFormat = "json" | "txt" | "csv";

/** 1: words and replacements. 2: one list of words with options. Both are read. */
export const FORMAT_VERSION = 2;

const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** What a term of the file keeps: the words, and the options that are set. */
const filed = ({ word, soundsLike, app, matchCase, remove, swapOnly }: Term) => ({
  word,
  soundsLike,
  ...(app && { app }),
  ...(matchCase && { matchCase }),
  ...(remove && { remove }),
  ...(swapOnly !== undefined && { swapOnly }),
});

/** The heard-as spellings and the text they become, one row each; an entry that removes text has the empty text. */
const pairs = (t: Term): [string, string][] => (t.remove ? [t.word, ...t.soundsLike].map((from): [string, string] => [from, ""]) : t.soundsLike.map((from): [string, string] => [from, t.word]));

/** Suggestions are not exported: they are not saved entries. */
export function exportVocabulary(v: Vocabulary, format: ExportFormat): string {
  const saved = v.terms.filter((t) => !t.suggested);
  if (format === "json") return JSON.stringify({ version: FORMAT_VERSION, terms: saved.map(filed) }, null, 2);
  if (format === "txt") return saved.map((t) => (t.soundsLike.length ? `${t.word} | ${t.soundsLike.join(", ")}` : t.word)).join("\n");
  return ["from,to", ...saved.flatMap(pairs).map(([from, to]) => `${csvCell(from)},${csvCell(to)}`)].join("\n");
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type SkipReason = "duplicate" | "too-long" | "invalid" | "full";

export interface ImportResult {
  vocabulary: Vocabulary;
  added: number;
  duplicates: number;
  tooLong: number;
  /** One line per skipped entry, as the person wrote it. */
  skipped: { line: string; reason: SkipReason }[];
  /** The file could not be used at all; nothing was added. */
  error?: "unreadable" | "newer";
}

type Parsed = { entries: { input: TermInput; line: string }[]; bad: string[]; error?: "unreadable" | "newer" };

const clip = (v: unknown): string => JSON.stringify(v).slice(0, 80);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const flag = (x: unknown): true | undefined => (x === true ? true : undefined);

/** A replacement of an older file as an entry: the phrase is heard as, the replacement is the word and is not sent to the speech model; without a replacement the phrase is removed. */
function ruleEntry(from: string, to: string, matchCase?: true): TermInput {
  return to ? { word: to, soundsLike: [from.trim()], matchCase, swapOnly: true } : { word: from, remove: true, matchCase };
}

/** An entry of a file; the line is how a skipped one is shown. */
function entry(input: TermInput): { input: TermInput; line: string } {
  const sounds = input.soundsLike ?? [];
  return { input, line: sounds.length ? `${input.word.trim()} | ${sounds.join(", ")}` : input.word.trim() };
}

function jsonEntries(data: Record<string, unknown>, out: Parsed): void {
  const each = (list: unknown, take: (o: Record<string, unknown>) => TermInput | undefined) => {
    for (const x of Array.isArray(list) ? list : []) {
      const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
      const input = take(o);
      if (input) out.entries.push(entry(input));
      else out.bad.push(clip(x));
    }
  };
  each(data.terms, (o) => {
    if (typeof o.word !== "string") return undefined;
    const app = typeof o.app === "string" ? o.app : undefined;
    return {
      word: o.word,
      soundsLike: cleanSounds(strings(o.soundsLike)),
      app,
      matchCase: flag(o.matchCase),
      remove: flag(o.remove),
      swapOnly: typeof o.swapOnly === "boolean" ? o.swapOnly : undefined,
    };
  });
  each(data.replacements, (o) => (typeof o.from === "string" && typeof o.to === "string" ? ruleEntry(o.from, o.to, flag(o.matchCase)) : undefined));
  each(data.corrections, (o) =>
    typeof o.heard === "string" && typeof o.correct === "string" ? { word: o.correct, soundsLike: [o.heard], app: typeof o.app === "string" ? o.app : undefined } : undefined,
  );
}

function parseJson(text: string): Parsed {
  const out: Parsed = { entries: [], bad: [] };
  let data: Record<string, unknown> | null;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...out, error: "unreadable" };
  }
  if (typeof data !== "object" || data === null) return { ...out, error: "unreadable" };
  if (typeof data.version === "number" && data.version > FORMAT_VERSION) return { ...out, error: "newer" };
  jsonEntries(data, out);
  return out;
}

function parseTxt(text: string): Parsed {
  const entries = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const [word = "", rest = ""] = line.split("|");
      return entry({ word, soundsLike: cleanSounds(rest.split(",")) });
    });
  return { entries, bad: [] };
}

function parseCsv(text: string): Parsed {
  const rows = csvRows(text);
  const body = rows[0]?.[0]?.trim().toLowerCase() === "from" ? rows.slice(1) : rows;
  return { entries: body.map(([from = "", to = ""]) => ({ input: ruleEntry(from, to), line: `${from},${to}` })), bad: [] };
}

const PARSERS: Record<ExportFormat, (text: string) => Parsed> = { json: parseJson, txt: parseTxt, csv: parseCsv };

const REASON: Record<TermError, SkipReason> = { empty: "invalid", "too-long": "too-long", duplicate: "duplicate", conflict: "duplicate", full: "full" };

/** Why an entry cannot be added before the list is asked, or nothing. */
function unusable(input: TermInput): SkipReason | undefined {
  if (!input.word.trim()) return "invalid";
  if ([...input.word.trim()].length > MAX_WORD || (input.soundsLike ?? []).some((s) => [...s].length > MAX_HEARD)) return "too-long";
  return undefined;
}

/** A heard-as spelling of the entry already belongs to another word of the same program: the file does not take it away. */
const claimed = (list: readonly Term[], input: TermInput): boolean => {
  const app = input.app?.trim() ? exeKey(input.app.trim()) : undefined;
  return (input.soundsLike ?? []).some((s) => list.some((t) => !t.suggested && t.app === app && !sameText(t.word, input.word) && t.soundsLike.some((x) => sameText(x, s))));
};

/** Merges a file into the list. An entry of the file for a word that is there only adds its heard-as spellings to it; duplicates and long entries are skipped and reported. */
export function importVocabulary(current: Vocabulary, text: string, format: ExportFormat): ImportResult {
  const r: ImportResult = { vocabulary: { terms: [...current.terms] }, added: 0, duplicates: 0, tooLong: 0, skipped: [] };
  const skip = (line: string, reason: SkipReason) => {
    r.skipped.push({ line, reason });
    if (reason === "duplicate") r.duplicates++;
    if (reason === "too-long") r.tooLong++;
  };
  const parsed = PARSERS[format](text);
  if (parsed.error) return { ...r, error: parsed.error };
  for (const line of parsed.bad) skip(line, "invalid");
  for (const { input, line } of parsed.entries) {
    const bad = unusable(input) ?? (claimed(r.vocabulary.terms, input) ? "duplicate" : undefined);
    if (bad) {
      skip(line, bad);
      continue;
    }
    const res = mergeTerm(r.vocabulary.terms, input);
    if (!res.ok) skip(line, REASON[res.error]);
    else {
      r.vocabulary.terms = res.list;
      r.added++;
    }
  }
  return r;
}
