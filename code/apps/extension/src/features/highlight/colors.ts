export interface Swatch {
  name: string;
  light: string;
  dark: string;
}

/** Sentence and word swatches; `dark` is used on dark pages when "Match page theme" is on. */
export const SENTENCE_SWATCHES: Swatch[] = [
  { name: "Yellow", light: "#FFF1C2", dark: "#433921" },
  { name: "Sky", light: "#DDEFFF", dark: "#1F3A52" },
  { name: "Mint", light: "#E0F5DC", dark: "#25402A" },
  { name: "Rose", light: "#FFDDE8", dark: "#4A2733" },
  { name: "Lilac", light: "#E7DEFF", dark: "#34294F" },
];
export const WORD_SWATCHES: Swatch[] = [
  { name: "Amber", light: "#FFD24D", dark: "#F2C04E" },
  { name: "Blue", light: "#78BDF7", dark: "#4A9AE0" },
  { name: "Green", light: "#8ED87F", dark: "#58B050" },
  { name: "Pink", light: "#FF8FB5", dark: "#E0648F" },
  { name: "Violet", light: "#B79CFF", dark: "#8F74E0" },
];

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Index of the swatch whose light color equals `hex`, or -1 for a custom color. */
export const swatchIndex = (list: Swatch[], hex: string) => list.findIndex((s) => eq(s.light, hex));

/** Color to paint for a stored hex on a page of the given darkness. */
export function paint(list: Swatch[], hex: string, dark: boolean, matchTheme: boolean): string {
  const i = swatchIndex(list, hex);
  return dark && matchTheme && i >= 0 ? list[i]!.dark : hex;
}

/**
 * Text on a word highlight stays dark in both themes, and the word colour on a dark page. Literals, not token reads: the content script
 * imports this file, and one read of `tokens` would put the whole token table (about 2 KB gzip) into it. colors.test.ts keeps them equal to the tokens.
 */
export const WORD_TEXT = "#1e1f20";
export const DARK_PAGE_WORD = "#f2c04e";
/** Sentence highlight on a dark page when "Match page theme" is on. */
export const DARK_PAGE_SENTENCE = "#78621F";
