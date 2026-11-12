import {
  applyReplacements,
  buildPrompt,
  FILLER_LANGUAGES,
  FORMATTING_LANGUAGES,
  MAX_TERMS,
  MAX_WORD,
  SYMBOL_LANGUAGES,
  soundsLikeRules,
  supportsPrompt,
  traceRules,
  validateWord,
  type ImportResult,
  type PromptPlan,
  type Term,
} from "@speakkit/dictation";
import type { Cleanup, Replacement } from "../../../shared/dictation/settings";

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", de: "German", es: "Spanish", ar: "Arabic" };
const names = (codes: readonly string[]) => codes.map((c) => LANGUAGE_NAMES[c] ?? c).join(", ");

export const wordCount = (n: number) => `${n} of ${MAX_TERMS} words`;
export const pronunciationCount = (n: number, max = 200) => `${n} of ${max} entries`;

export interface Draft {
  word: string;
  soundsLike: string;
}

export interface DraftCheck {
  /** Add stays disabled. */
  blocked: boolean;
  /** The line under the field, when there is something to say. */
  message?: string;
  /** The length counter shows in red. */
  counter?: { length: number; max: number; over: boolean };
  /** A duplicate: the entry it collides with, for "Show entry". */
  existing?: Term;
}

const sounds = (raw: string): string[] =>
  raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
export const parseSounds = sounds;

/** What the add-word dialog says about what is typed so far. */
export function checkDraft(terms: readonly Term[], draft: Draft, editingId?: string): DraftCheck {
  const word = draft.word.trim();
  const length = [...word].length;
  const counter = { length, max: MAX_WORD, over: length > MAX_WORD };
  if (!word) return { blocked: true };
  const error = validateWord(terms, word, editingId);
  if (error === "too-long") return { blocked: true, counter, message: `Words and names can be up to ${MAX_WORD} characters. This one is ${length}.` };
  if (error === "duplicate") {
    const existing = terms.find((t) => t.id !== editingId && t.word.toLowerCase() === word.toLowerCase());
    return { blocked: true, ...(existing && { existing }), message: `"${existing?.word ?? word}" is already in the list.` };
  }
  if (!editingId && terms.length >= MAX_TERMS) return { blocked: true, message: `The list is full: ${MAX_TERMS} words. Remove one to add another.` };
  return { blocked: false, counter };
}

export const filterTerms = (terms: readonly Term[], query: string): Term[] => {
  const q = query.trim().toLowerCase();
  return q ? terms.filter((t) => t.word.toLowerCase().includes(q) || t.soundsLike.some((s) => s.toLowerCase().includes(q))) : [...terms];
};

export interface PromptSummary {
  state: "off" | "empty" | "unsupported" | "on";
  plan: PromptPlan;
  line: string;
  note?: string;
}

/** The speech-model prompt card: what is sent, how much of the budget it uses and what happens to the rest. */
export function promptSummary(terms: readonly Term[], model: string, on: boolean, modelName: string): PromptSummary {
  const plan = buildPrompt(terms);
  if (!supportsPrompt(model))
    return { state: "unsupported", plan, line: "Not used with this speech model.", note: `${modelName} cannot read a word list. Your words still work through replacements, and nothing is blocked.` };
  if (!terms.length) return { state: "empty", plan, line: "Nothing to send yet." };
  const line = `${plan.included} of ${terms.length} ${terms.length === 1 ? "word" : "words"} read by the model, ${plan.used} of ${plan.budget} characters.`;
  const note = plan.dropped ? `The other ${plan.dropped} still work: they are fixed after the model has heard you.` : undefined;
  return { state: on ? "on" : "off", plan, line, ...(note && { note }) };
}

export interface CleanupRow {
  key: keyof Cleanup;
  label: string;
  description: string;
  /** Which languages the rule has a table for. */
  scope?: string;
  /** The rule has nothing for the chosen language: the switch is off and says why. */
  unavailable?: string;
}

/** The clean-up switches for the chosen language. Filler removal, spoken symbols and spoken formatting are language rules; the rest apply to every language. */
export function cleanupRows(language: string): CleanupRow[] {
  const lang = language === "auto" ? "en" : language;
  const name = LANGUAGE_NAMES[lang] ?? lang;
  const scoped = (list: readonly string[]): { scope: string; unavailable?: string } => ({
    scope: `${names(list)}${list.length === 1 ? " only" : ""}`,
    ...(!list.includes(lang) && { unavailable: `Not available for ${name} yet.` }),
  });
  return [
    { key: "fillers", label: "Remove filler words", description: 'Takes out "um", "uh" and "you know".', ...scoped(FILLER_LANGUAGES) },
    { key: "spokenSymbols", label: "Spoken symbols", description: 'Say "question mark" to type ?', ...scoped(SYMBOL_LANGUAGES) },
    { key: "spokenFormatting", label: "Spoken formatting", description: 'Say "new line" or "bullet". Numbers and lists you say are never reworded.', ...scoped(FORMATTING_LANGUAGES) },
    { key: "autoCapitalize", label: "Capitalise sentences", description: "A capital letter at the start of each sentence." },
    { key: "lowercase", label: "Lowercase everything", description: "For chat and search boxes. Words from your list keep their spelling." },
    { key: "stripFinalStop", label: "No full stop at the end", description: "Removes only the last character of the whole dictation, never one inside it." },
    { key: "trailingSpace", label: "Space after the text", description: "So the next dictation does not run into this one." },
  ];
}

export interface Stage {
  key: "heard" | "words" | "replacements" | "cleanup";
  title: string;
  note: string;
  text: string;
}

/** Each step of the pipeline for a typed sentence, ending in the text that would be inserted. */
export function testStages(heard: string, o: { terms: readonly Term[]; replacements: readonly Replacement[]; cleanup: Cleanup; language: string }): { stages: Stage[]; final: string } {
  const own = soundsLikeRules(o.terms);
  const all = [...o.replacements, ...own];
  const base = { ...o.cleanup, replacements: all, language: o.language };
  const trace = traceRules(heard, base);
  const raw = trace.raw;
  // The words step shows what the vocabulary alone changes; the replacements step what the replacement list adds on top, using the one pass the dictation uses.
  const words = trace.notes.includes("noise") || trace.notes.includes("numbers-only") ? raw : applyReplacements(o.cleanup.lowercase ? raw.toLowerCase() : raw, [...own]);
  const stages: Stage[] = [
    { key: "heard", title: "Model heard", note: "The raw text", text: raw },
    { key: "words", title: "Words and names", note: ruleNote(own.length, "sounds-like", raw, words), text: words },
    { key: "replacements", title: "Replacements", note: ruleNote(o.replacements.length, "replacement", words, trace.replacements), text: trace.replacements },
    { key: "cleanup", title: "Clean-up", note: cleanupNote(o.cleanup), text: trace.final.trimEnd() },
  ];
  return { stages, final: trace.final.trimEnd() };
}

function ruleNote(count: number, what: string, before: string, after: string): string {
  if (!count) return `No ${what} rules`;
  return before === after ? "Nothing changed" : "Changed";
}

function cleanupNote(c: Cleanup): string {
  const on = [
    c.fillers && "fillers",
    c.spokenSymbols && "symbols",
    c.spokenFormatting && "formatting",
    c.autoCapitalize && "capital letter",
    c.lowercase && "lowercase",
    c.stripFinalStop && "no full stop",
  ].filter(Boolean);
  return on.length ? on.join(", ") : "All switches off";
}

/** The words that differ between what was heard and the final text, as one run, for "Fix this". */
export function changedWords(heard: string, final: string): { heard: string; word: string } | undefined {
  const a = heard.trim().split(/\s+/);
  const b = final.trim().split(/\s+/);
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  let i = 0;
  while (i < a.length && i < b.length && norm(a[i]!) === norm(b[i]!)) i++;
  let ja = a.length;
  let jb = b.length;
  while (ja > i && jb > i && norm(a[ja - 1]!) === norm(b[jb - 1]!)) {
    ja--;
    jb--;
  }
  const h = a.slice(i, ja).join(" ");
  const w = b.slice(i, jb).join(" ");
  return h && w
    ? {
        heard: h
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s'-]/gu, "")
          .trim(),
        word: w.replace(/[.,!?;:]+$/, ""),
      }
    : undefined;
}

export interface ImportView {
  title: string;
  body: string[];
  skipped: { line: string; why: string }[];
  failed: boolean;
}

const WHY: Record<ImportResult["skipped"][number]["reason"], string> = { duplicate: "already in the list", "too-long": "too long", invalid: "not a usable entry", full: "the list is full" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The wording of the import result dialog. */
export function importView(r: ImportResult, name: string): ImportView {
  if (r.error === "unreadable") return { title: "Could not import", body: [`${name} is not a file Speak Kit can read. Nothing was added.`], skipped: [], failed: true };
  if (r.error === "newer") return { title: "Could not import", body: [`${name} was made by a newer Speak Kit. Update Speak Kit to read it. Nothing was added.`], skipped: [], failed: true };
  const skips = [r.duplicates && plural(r.duplicates, "duplicate"), r.tooLong && `${plural(r.tooLong, "entry", "entries")} that ${r.tooLong === 1 ? "is" : "are"} too long`].filter(Boolean);
  const body = [`${plural(r.addedWords, "word")} and ${plural(r.addedReplacements, "replacement")} were added.`];
  if (skips.length) body.push(`${skips.join(" and ")} ${skips.length === 1 && r.duplicates === 1 && !r.tooLong ? "was" : "were"} skipped.`);
  return { title: "Import finished", body, skipped: r.skipped.map((s) => ({ line: s.line, why: WHY[s.reason] })), failed: false };
}
