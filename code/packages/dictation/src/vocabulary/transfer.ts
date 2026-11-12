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

/** Merges a file into the list. Nothing already there is changed; duplicates and long entries are skipped and reported. */
export function importVocabulary(current: Vocabulary, text: string, format: ExportFormat): ImportResult {
  const r: ImportResult = { vocabulary: { terms: [...current.terms], replacements: [...current.replacements] }, addedWords: 0, addedReplacements: 0, duplicates: 0, tooLong: 0, skipped: [] };
  const skip = (line: string, reason: SkipReason) => {
    r.skipped.push({ line, reason });
    if (reason === "duplicate") r.duplicates++;
    if (reason === "too-long") r.tooLong++;
  };
  const word = (w: string, sounds: string[]) => {
    const res = addTerm(r.vocabulary.terms, { word: w, soundsLike: sounds });
    if (res.ok) {
      r.vocabulary.terms = res.list;
      r.addedWords++;
    } else skip(sounds.length ? `${w.trim()} | ${sounds.join(", ")}` : w.trim(), res.error === "empty" ? "invalid" : res.error);
  };
  const rule = (from: string, to: string) => {
    const f = from.trim();
    const line = `${from},${to}`;
    if (!f) return skip(line, "invalid");
    if ([...f].length > MAX_RULE_FROM || to.length > MAX_RULE_TO) return skip(line, "too-long");
    if (r.vocabulary.replacements.some((x) => x.from.toLowerCase() === f.toLowerCase())) return skip(line, "duplicate");
    if (r.vocabulary.replacements.length >= MAX_RULES) return skip(line, "full");
    r.vocabulary.replacements.push({ from: f, to });
    r.addedReplacements++;
  };
  if (format === "json") {
    let data: { version?: unknown; terms?: unknown; replacements?: unknown } | null;
    try {
      data = JSON.parse(text);
    } catch {
      return { ...r, error: "unreadable" };
    }
    if (typeof data !== "object" || data === null) return { ...r, error: "unreadable" };
    if (typeof data.version === "number" && data.version > FORMAT_VERSION) return { ...r, error: "newer" };
    for (const t of Array.isArray(data.terms) ? data.terms : []) {
      const o = t as { word?: unknown; soundsLike?: unknown } | null;
      if (typeof o?.word !== "string") skip(JSON.stringify(t).slice(0, 80), "invalid");
      else word(o.word, Array.isArray(o.soundsLike) ? cleanSounds(o.soundsLike.filter((s): s is string => typeof s === "string")) : []);
    }
    for (const x of Array.isArray(data.replacements) ? data.replacements : []) {
      const o = x as { from?: unknown; to?: unknown } | null;
      if (typeof o?.from !== "string" || typeof o.to !== "string") skip(JSON.stringify(x).slice(0, 80), "invalid");
      else rule(o.from, o.to);
    }
  } else if (format === "txt") {
    for (const line of text.split(/\r?\n/).filter((l) => l.trim())) {
      const [w = "", rest = ""] = line.split("|");
      word(w, cleanSounds(rest.split(",")));
    }
  } else {
    const rows = csvRows(text);
    const body = rows[0]?.[0]?.trim().toLowerCase() === "from" ? rows.slice(1) : rows;
    for (const [from = "", to = ""] of body) rule(from, to);
  }
  return r;
}
