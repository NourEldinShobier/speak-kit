import type { Settings } from "../settings";
import { capitalize } from "./capitalize";
import { stripFillers, FILLER_LANGUAGES } from "./fillers";
import { applyReplacements } from "./replacements";
import { spokenFormatting, spokenSymbols, FORMATTING_LANGUAGES, SYMBOL_LANGUAGES } from "./spoken";

export { applyReplacements } from "./replacements";
export { FILLER_LANGUAGES, FORMATTING_LANGUAGES, SYMBOL_LANGUAGES };

export type RulesOptions = Pick<Settings, "fillers" | "spokenSymbols" | "spokenFormatting" | "autoCapitalize" | "trailingSpace" | "replacements"> &
  Partial<Pick<Settings, "lowercase" | "stripFinalStop">> & {
    /** Language of the text: a code such as "en", or "auto" when the engine did not say. */
    language: string;
  };

// Models print these for silence and music; they are not speech.
const NOISE_TAG = /^[[(*][^\])*\n]{1,40}[\])*]$/;
// Digits with the punctuation that joins them: a phone number, a list of figures. Nothing here is a word to clean up.
const NUMBERS_ONLY = /^(?=.*\d)[\d\s.,:;+\-–/()%$€£#]+$/u;

export const isNumbersOnly = (text: string): boolean => NUMBERS_ONLY.test(text.trim());

export interface RulesTrace {
  raw: string;
  /** After lower-casing and the replacement list (vocabulary spellings included). */
  replacements: string;
  fillers: string;
  /** After spoken formatting and spoken symbols. */
  symbols: string;
  final: string;
  /** Rules that were skipped and why, for the tester. */
  notes: ("noise" | "numbers-only" | "fillers-language" | "formatting-language" | "symbols-language")[];
}

const languageOf = (language: string): string => {
  const lang = language.toLowerCase().replace(/-.*/, "");
  return lang === "auto" ? "en" : lang;
};

type Note = RulesTrace["notes"][number];

/** Which switches are on for a language that has no rule for them. */
function missingLanguage(opts: RulesOptions, spoken: string): Note[] {
  const notes: Note[] = [];
  if (opts.fillers && !FILLER_LANGUAGES.includes(spoken)) notes.push("fillers-language");
  if (opts.spokenFormatting && !FORMATTING_LANGUAGES.includes(spoken)) notes.push("formatting-language");
  if (opts.spokenSymbols && !SYMBOL_LANGUAGES.includes(spoken)) notes.push("symbols-language");
  return notes;
}

/** Only the last character of the whole dictation: a single full stop, never part of "..." or an abbreviation like "e.g.". */
export const dropFinalStop = (text: string): string => text.replace(/(?<!\.\p{L})(?<!\.)\.(?=\s*$)/u, "");

/** Capitals, the final full stop and the space after the text. */
function finish(text: string, opts: RulesOptions): string {
  let out = opts.autoCapitalize && !opts.lowercase ? capitalize(text) : text;
  if (opts.stripFinalStop) out = dropFinalStop(out);
  if (!out.trim()) return "";
  return opts.trailingSpace && !/\s$/.test(out) ? `${out} ` : out;
}

/** Every stage of the clean-up in order, so the tester can show where a word changed. `applyRules` is the last stage. */
export function traceRules(heard: string, opts: RulesOptions): RulesTrace {
  const raw = heard.trim();
  if (NOISE_TAG.test(raw)) return { raw, replacements: "", fillers: "", symbols: "", final: "", notes: ["noise"] };
  // Digits and their punctuation are never rewritten: only the trailing space applies.
  if (isNumbersOnly(raw)) return { raw, replacements: raw, fillers: raw, symbols: raw, final: opts.trailingSpace ? `${raw} ` : raw, notes: ["numbers-only"] };
  const spoken = languageOf(opts.language);
  const replacements = applyReplacements(opts.lowercase ? raw.toLowerCase() : raw, opts.replacements);
  const fillers = opts.fillers && FILLER_LANGUAGES.includes(spoken) ? stripFillers(replacements) : replacements;
  const formatted = opts.spokenFormatting ? spokenFormatting(fillers, spoken) : fillers;
  const symbols = opts.spokenSymbols ? spokenSymbols(formatted, spoken) : formatted;
  return { raw, replacements, fillers, symbols, final: finish(symbols, opts), notes: missingLanguage(opts, spoken) };
}

/** Turns what the speech engine heard into what gets inserted. An empty result means there was nothing to insert. */
export const applyRules = (heard: string, opts: RulesOptions): string => traceRules(heard, opts).final;
