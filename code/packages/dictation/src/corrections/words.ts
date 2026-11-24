/** One word of a text, with where it sits. */
export interface Word {
  text: string;
  /** Lower case, the form words are compared in. */
  key: string;
  start: number;
  end: number;
}

// Letters, digits and the marks that make an accent, with an inner apostrophe or hyphen ("don't", "built-in"); punctuation and spaces separate words.
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu;

/** Offsets are those of `text` itself; the key is the word in composed form and lower case, so "Café" typed with a loose accent equals the composed one. */
export const wordsOf = (text: string): Word[] => [...text.matchAll(WORD)].map((m) => ({ text: m[0], key: m[0].normalize("NFC").toLowerCase(), start: m.index, end: m.index + m[0].length }));

/** Frequent English words that carry no content: an edit that only swaps these is a grammar fix, not a mishearing. */
const FUNCTION_WORDS = new Set(
  "a an the and or but nor so yet if then than that this these those there their they them he she it its his her we you your our i me my is are was were be been am do does did have has had will would can could should may might must not no to of in on at by for from with as into up out off over about after before so too very just also".split(
    " ",
  ),
);

export const isFunctionWord = (key: string): boolean => FUNCTION_WORDS.has(key);

/** Figures, and links, paths, addresses and file names: nothing to learn from. */
export const hasDigits = (text: string): boolean => /\d/.test(text);
export const looksTechnical = (text: string): boolean => /https?:|www\.|[\\/@]|\w\.\w{2,}/i.test(text);
