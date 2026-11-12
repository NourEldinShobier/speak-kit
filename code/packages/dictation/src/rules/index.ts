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

/** Every stage of the clean-up in order, so the tester can show where a word changed. `applyRules` is the last stage. */
export function traceRules(heard: string, opts: RulesOptions): RulesTrace {
  const raw = heard.trim();
  const t: RulesTrace = { raw, replacements: raw, fillers: raw, symbols: raw, final: "", notes: [] };
  if (NOISE_TAG.test(raw)) return { ...t, replacements: "", fillers: "", symbols: "", notes: ["noise"] };
  // Digits and their punctuation are never rewritten: only the trailing space applies.
  if (isNumbersOnly(raw)) {
    t.notes.push("numbers-only");
    t.final = opts.trailingSpace ? `${raw} ` : raw;
    return t;
  }
  const spoken = languageOf(opts.language);
  let text = opts.lowercase ? raw.toLowerCase() : raw;
  text = t.replacements = applyReplacements(text, opts.replacements);
  if (opts.fillers) {
    if (FILLER_LANGUAGES.includes(spoken)) text = stripFillers(text);
    else t.notes.push("fillers-language");
  }
  t.fillers = text;
  if (opts.spokenFormatting) {
    if (!FORMATTING_LANGUAGES.includes(spoken)) t.notes.push("formatting-language");
    text = spokenFormatting(text, spoken);
  }
  if (opts.spokenSymbols) {
    if (!SYMBOL_LANGUAGES.includes(spoken)) t.notes.push("symbols-language");
    text = spokenSymbols(text, spoken);
  }
  t.symbols = text;
  if (opts.autoCapitalize && !opts.lowercase) text = capitalize(text);
  // Only the last character of the whole dictation: a single full stop, never part of "..." or an abbreviation like "e.g.".
  if (opts.stripFinalStop) text = text.replace(/(?<!\.\p{L})(?<!\.)\.(?=\s*$)/u, "");
  if (!text.trim()) return { ...t, final: "" };
  t.final = opts.trailingSpace && !/\s$/.test(text) ? `${text} ` : text;
  return t;
}

/** Turns what the speech engine heard into what gets inserted. An empty result means there was nothing to insert. */
export const applyRules = (heard: string, opts: RulesOptions): string => traceRules(heard, opts).final;
