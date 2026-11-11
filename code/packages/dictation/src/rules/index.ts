import type { Settings } from "../settings";
import { capitalize } from "./capitalize";
import { stripFillers } from "./fillers";
import { applyReplacements } from "./replacements";
import { spokenFormatting, spokenSymbols } from "./spoken";

export type RulesOptions = Pick<Settings, "fillers" | "spokenSymbols" | "spokenFormatting" | "autoCapitalize" | "trailingSpace" | "replacements"> & {
  /** Language of the text: a code such as "en", or "auto" when the engine did not say. */
  language: string;
};

// Models print these for silence and music; they are not speech.
const NOISE_TAG = /^[[(*][^\])*\n]{1,40}[\])*]$/;

/** Turns what the speech engine heard into what gets inserted. An empty result means there was nothing to insert. */
export function applyRules(heard: string, opts: RulesOptions): string {
  let text = heard.trim();
  if (NOISE_TAG.test(text)) return "";
  const lang = opts.language.toLowerCase().split("-")[0] ?? "en";
  const spoken = lang === "auto" ? "en" : lang;
  text = applyReplacements(text, opts.replacements);
  if (opts.fillers && spoken === "en") text = stripFillers(text);
  if (opts.spokenFormatting) text = spokenFormatting(text, spoken);
  if (opts.spokenSymbols) text = spokenSymbols(text, spoken);
  if (opts.autoCapitalize) text = capitalize(text);
  text = text.replace(/^[ \t]+/, "");
  if (!text.trim()) return "";
  return opts.trailingSpace && !/\s$/.test(text) ? `${text} ` : text;
}
