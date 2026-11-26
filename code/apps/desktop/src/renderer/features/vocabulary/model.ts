import {
  buildPrompt,
  FILLER_LANGUAGES,
  FORMATTING_LANGUAGES,
  isSwapOnly,
  MAX_TERMS,
  MAX_WORD,
  SYMBOL_LANGUAGES,
  supportsPrompt,
  validateWord,
  type ImportResult,
  type PromptPlan,
  type Term,
} from "@speakkit/dictation";
import type { Cleanup } from "../../../shared/dictation/settings";

const LANGUAGE_NAMES: Record<string, string> = { en: "English", de: "German", es: "Spanish", ar: "Arabic" };
const names = (codes: readonly string[]) => codes.map((c) => LANGUAGE_NAMES[c] ?? c).join(", ");

export const wordCount = (n: number) => `${n} of ${MAX_TERMS} words`;
export const pronunciationCount = (n: number, max = 200) => `${n} of ${max} entries`;

export interface Draft {
  word: string;
  soundsLike: string;
  /** The program file name the entry is limited to; empty for every program. */
  app?: string;
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
  const app = draft.app?.trim() ?? "";
  if (/[\s\\/]/.test(app)) return { blocked: true, counter, message: "Use the program file name, such as code.exe." };
  const error = validateWord(terms, word, { ignoreId: editingId, app });
  if (error === "too-long") return { blocked: true, counter, message: `Words and names can be up to ${MAX_WORD} characters. This one is ${length}.` };
  if (error === "duplicate") {
    const existing = savedTerms(terms).find((t) => t.id !== editingId && t.word.toLowerCase() === word.toLowerCase() && (t.app ?? "") === app.toLowerCase().replace(/\.exe$/, ""));
    return { blocked: true, ...(existing && { existing }), message: `"${existing?.word ?? word}" is already in the list.` };
  }
  if (!editingId && terms.length >= MAX_TERMS) return { blocked: true, message: `The list is full: ${MAX_TERMS} words. Remove one to add another.` };
  return { blocked: false, counter };
}

/** The entries the person keeps; a suggestion is not one yet. */
export const savedTerms = (terms: readonly Term[]): Term[] => terms.filter((t) => !t.suggested);

/** Fixes that were learned and wait for "Use" or "Dismiss". */
export const suggestedTerms = (terms: readonly Term[]): Term[] => terms.filter((t) => t.suggested);

export const seenText = (t: Pick<Term, "learned">): string => ((t.learned?.count ?? 1) === 1 ? "Seen once" : `Seen ${t.learned?.count} times`);

export const filterTerms = (terms: readonly Term[], query: string): Term[] => {
  const q = query.trim().toLowerCase();
  return q ? terms.filter((t) => t.word.toLowerCase().includes(q) || t.soundsLike.some((s) => s.toLowerCase().includes(q))) : [...terms];
};

/** The short notes shown under a word: where it applies and the options that are set. */
export const termNotes = (t: Term): string[] =>
  [t.app && `Only in ${t.app}.exe`, t.matchCase && "Matches capitals", t.remove && "Removes the phrase", !t.remove && isSwapOnly(t) && "Not sent to the speech model"].filter((x): x is string => !!x);

export interface PromptSummary {
  state: "off" | "empty" | "unsupported" | "on";
  plan: PromptPlan;
  line: string;
  note?: string;
}

/** The speech-model prompt card: what is sent, how much of the budget it uses and what happens to the rest. */
export function promptSummary(terms: readonly Term[], o: { model: string; on: boolean; modelName: string }): PromptSummary {
  const { model, on, modelName } = o;
  const plan = buildPrompt(terms);
  const total = plan.included + plan.dropped;
  if (!supportsPrompt(model))
    return {
      state: "unsupported",
      plan,
      line: "Not used with this speech model.",
      note: `${modelName} cannot read a word list. Words you gave a "Heard as" spelling still work, and nothing is blocked.`,
    };
  if (!total) return { state: "empty", plan, line: "Nothing to send yet." };
  const line = `${plan.included} of ${total} ${total === 1 ? "word" : "words"} read by the model, ${plan.used} of ${plan.budget} characters.`;
  const note = plan.dropped ? `The other ${plan.dropped} still work: they are fixed after the model has heard you.` : undefined;
  return { state: on ? "on" : "off", plan, line, ...(note && { note }) };
}

export interface CleanupRow {
  key: keyof Cleanup;
  label: string;
  description: string;
  /** Which languages the rule has a table for. */
  scope?: string;
  /** The rule has nothing for the dictation language: the switch is off and says why. */
  unavailable?: string;
}

/** The clean-up switches for the dictation language. Filler removal, spoken symbols and spoken formatting are language rules; the rest apply to every language. */
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
    { key: "stripFinalStop", label: "No full stop at the end", description: "Removes only the last character of the whole dictation, never one inside it." },
    { key: "trailingSpace", label: "Space after the text", description: "So the next dictation does not run into this one." },
  ];
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
  const body = [`${plural(r.added, "entry", "entries")} ${r.added === 1 ? "was" : "were"} added.`];
  if (skips.length) body.push(`${skips.join(" and ")} ${skips.length === 1 && r.duplicates === 1 && !r.tooLong ? "was" : "were"} skipped.`);
  return { title: "Import finished", body, skipped: r.skipped.map((s) => ({ line: s.line, why: WHY[s.reason] })), failed: false };
}
