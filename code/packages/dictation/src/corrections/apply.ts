import type { Fix } from "../vocabulary/terms";
import { wordsOf, type Word } from "./words";

/** What a correction changed in a dictation, for the history and the undo. */
export interface Applied {
  heard: string;
  correct: string;
}

/** Most fixes made in one dictation: a rule that matches everywhere is a mistake, not a habit. */
export const MAX_APPLIED = 5;

interface Hit {
  from: number;
  to: number;
  text: string;
  by: Fix;
}

const keysOf = (phrase: string): string[] => wordsOf(phrase).map((w) => w.key);

/** Where the phrase stands in the words: each word follows the last with only spaces between. Spans are [first, last] word indexes. */
function find(text: string, words: Word[], phrase: string[]): [number, number][] {
  const spans: [number, number][] = [];
  if (!phrase.length) return spans;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    const run = words.slice(i, i + phrase.length);
    const fits = run.every((w, k) => w.key === phrase[k] && (k === 0 || /^[ \t]+$/.test(text.slice(run[k - 1]!.end, w.start))));
    if (fits) spans.push([i, i + phrase.length - 1]);
  }
  return spans;
}

/** The text before `index` ends a sentence (or there is none). */
const startsSentence = (text: string, index: number): boolean => /(^|[.!?]["')\]]*\s+|\n\s*)$/.test(text.slice(0, index));

/**
 * The fix written the way the text is: capitals for a shouted phrase, and a capital for a plain lowercase fix that starts a sentence. A fix with a capital
 * of its own after the first letter ("iPhone", "eBay") is kept as the person wrote it.
 */
function inCase(text: string, at: { start: number; end: number }, correct: string): string {
  const found = text.slice(at.start, at.end);
  if (/\p{L}.*\p{L}/u.test(found) && found === found.toUpperCase()) return correct.toUpperCase();
  const plain = correct === correct.toLowerCase() && correct !== correct.toUpperCase();
  return plain && startsSentence(text, at.start) ? correct.charAt(0).toUpperCase() + correct.slice(1) : correct;
}

/** Fixes for one program come before fixes for everywhere, and fixes saved on purpose before those only seen twice. */
const rank = (c: Fix): number => (c.app ? 0 : 2) + (c.confirmed ? 0 : 1);

/**
 * Swaps the misheard phrase of each correction for the right one: whole words, any capitals, the longest phrase first, each place once.
 * Text that already says the right words stays as it is (a fix that adds to a word never adds twice), and a dictation changes in at most `MAX_APPLIED` places.
 */
export function applyCorrections(text: string, corrections: readonly Fix[]): { text: string; applied: Applied[] } {
  const words = wordsOf(text);
  const hits: Hit[] = [];
  const ordered = corrections.map((c) => ({ c, phrase: keysOf(c.heard) })).sort((x, y) => y.phrase.length - x.phrase.length || rank(x.c) - rank(y.c));
  for (const { c, phrase } of ordered) {
    const already = find(text, words, keysOf(c.correct));
    for (const [from, to] of find(text, words, phrase)) {
      const inside = already.some(([a, b]) => a <= from && to <= b);
      const taken = hits.some((h) => from <= h.to && h.from <= to);
      if (!inside && !taken) hits.push({ from, to, text: inCase(text, { start: words[from]!.start, end: words[to]!.end }, c.correct), by: c });
    }
  }
  const chosen = hits.sort((x, y) => x.from - y.from).slice(0, MAX_APPLIED);
  let out = "";
  let cursor = 0;
  for (const h of chosen) {
    out += text.slice(cursor, words[h.from]!.start) + h.text;
    cursor = words[h.to]!.end;
  }
  return { text: out + text.slice(cursor), applied: chosen.map((h) => ({ heard: h.by.heard, correct: h.by.correct })) };
}
