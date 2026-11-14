import { addTerm, cleanSounds, type Term } from "./terms";

export interface Rule {
  from: string;
  to: string;
}
export interface Vocabulary {
  terms: Term[];
  replacements: Rule[];
}
export type ExportFormat = "json" | "txt" | "csv";

export const FORMAT_VERSION = 1;
export const MAX_RULES = 100;
export const MAX_RULE_FROM = 80;
export const MAX_RULE_TO = 200;

const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function exportVocabulary(v: Vocabulary, format: ExportFormat): string {
  if (format === "json") return JSON.stringify({ version: FORMAT_VERSION, terms: v.terms.map(({ word, soundsLike }) => ({ word, soundsLike })), replacements: v.replacements }, null, 2);
  if (format === "txt") return v.terms.map((t) => (t.soundsLike.length ? `${t.word} | ${t.soundsLike.join(", ")}` : t.word)).join("\n");
  return ["from,to", ...v.replacements.map((r) => `${csvCell(r.from)},${csvCell(r.to)}`)].join("\n");
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
  addedWords: number;
  addedReplacements: number;
  duplicates: number;
  tooLong: number;
  /** One line per skipped entry, as the person wrote it. */
  skipped: { line: string; reason: SkipReason }[];
  /** The file could not be used at all; nothing was added. */
  error?: "unreadable" | "newer";
}

type Parsed = { terms: { word: string; soundsLike: string[] }[]; rules: { from: string; to: string }[]; bad: string[]; error?: "unreadable" | "newer" };

const clip = (v: unknown): string => JSON.stringify(v).slice(0, 80);

function jsonTerms(list: unknown, out: Parsed): void {
  for (const t of Array.isArray(list) ? list : []) {
    const o = t as { word?: unknown; soundsLike?: unknown } | null;
    if (typeof o?.word !== "string") out.bad.push(clip(t));
    else out.terms.push({ word: o.word, soundsLike: Array.isArray(o.soundsLike) ? cleanSounds(o.soundsLike.filter((s): s is string => typeof s === "string")) : [] });
  }
}

function jsonRules(list: unknown, out: Parsed): void {
  for (const x of Array.isArray(list) ? list : []) {
    const o = x as { from?: unknown; to?: unknown } | null;
    if (typeof o?.from !== "string" || typeof o.to !== "string") out.bad.push(clip(x));
    else out.rules.push({ from: o.from, to: o.to });
  }
}

function parseJson(text: string): Parsed {
  const out: Parsed = { terms: [], rules: [], bad: [] };
  let data: { version?: unknown; terms?: unknown; replacements?: unknown } | null;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...out, error: "unreadable" };
  }
  if (typeof data !== "object" || data === null) return { ...out, error: "unreadable" };
  if (typeof data.version === "number" && data.version > FORMAT_VERSION) return { ...out, error: "newer" };
  jsonTerms(data.terms, out);
  jsonRules(data.replacements, out);
  return out;
}

function parseTxt(text: string): Parsed {
  const terms = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const [word = "", rest = ""] = line.split("|");
      return { word, soundsLike: cleanSounds(rest.split(",")) };
    });
  return { terms, rules: [], bad: [] };
}

function parseCsv(text: string): Parsed {
  const rows = csvRows(text);
  const body = rows[0]?.[0]?.trim().toLowerCase() === "from" ? rows.slice(1) : rows;
  return { terms: [], rules: body.map(([from = "", to = ""]) => ({ from, to })), bad: [] };
}

const PARSERS: Record<ExportFormat, (text: string) => Parsed> = { json: parseJson, txt: parseTxt, csv: parseCsv };

/** Merges a file into the list. Nothing already there is changed; duplicates and long entries are skipped and reported. */
export function importVocabulary(current: Vocabulary, text: string, format: ExportFormat): ImportResult {
  const r: ImportResult = { vocabulary: { terms: [...current.terms], replacements: [...current.replacements] }, addedWords: 0, addedReplacements: 0, duplicates: 0, tooLong: 0, skipped: [] };
  const skip = (line: string, reason: SkipReason) => {
    r.skipped.push({ line, reason });
    if (reason === "duplicate") r.duplicates++;
    if (reason === "too-long") r.tooLong++;
  };
  const parsed = PARSERS[format](text);
  if (parsed.error) return { ...r, error: parsed.error };
  for (const line of parsed.bad) skip(line, "invalid");
  for (const { word, soundsLike } of parsed.terms) {
    const res = addTerm(r.vocabulary.terms, { word, soundsLike });
    if (res.ok) {
      r.vocabulary.terms = res.list;
      r.addedWords++;
    } else skip(soundsLike.length ? `${word.trim()} | ${soundsLike.join(", ")}` : word.trim(), res.error === "empty" ? "invalid" : res.error);
  }
  for (const { from, to } of parsed.rules) {
    const why = addRule(r, from, to);
    if (why) skip(`${from},${to}`, why);
  }
  return r;
}

/** Adds one replacement unless it is empty, too long, a duplicate or over the limit; says which. */
function addRule(r: ImportResult, from: string, to: string): SkipReason | undefined {
  const f = from.trim();
  if (!f) return "invalid";
  if ([...f].length > MAX_RULE_FROM || to.length > MAX_RULE_TO) return "too-long";
  if (r.vocabulary.replacements.some((x) => x.from.toLowerCase() === f.toLowerCase())) return "duplicate";
  if (r.vocabulary.replacements.length >= MAX_RULES) return "full";
  r.vocabulary.replacements.push({ from: f, to });
  r.addedReplacements++;
  return undefined;
}
