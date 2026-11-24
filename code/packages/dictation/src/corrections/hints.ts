import { DEFAULT_TEMPLATE, TEMPLATES, type TemplateId } from "../modes/templates";
import { compact, likeness } from "./similarity";
import type { Correction } from "./store";
import { MAX_PHRASE } from "./learn";
import { wordsOf, type Word } from "./words";

/** A spot in the dictation that may be a stored misheard phrase, spelled a little differently: the words as dictated and what they may be. */
export interface Hint {
  heard: string;
  correct: string;
  start: number;
  end: number;
}

export const MAX_HINTS = 10;
/** Phrases that look this much like a stored one are offered to the writer when a neighbouring word is the same as at the time of learning. */
const NEAR_MATCH = 0.85;
/** ... and with no such word, only when they look almost the same. */
const CLOSE_MATCH = 0.92;
/** A window of plain short words next to a stored phrase that has no neighbours (one typed by hand) must look all but the same. */
const SAME_MATCH = 0.93;
/** Stored phrases shorter than this (in letters) are never matched loosely: short words are too often something else. */
const MIN_LETTERS = 5;
const LENGTH_SLACK = 0.25;
/** A window of short words ("cloud code") is ordinary English, so it needs a neighbour as proof. */
const PLAIN_WORD = 5;

const gap = (text: string, a: Word, b: Word): boolean => /^[ \t]+$/.test(text.slice(a.end, b.start));

/** The words of the text and the window under test: where it starts and how many words it has. */
interface Spot {
  text: string;
  words: Word[];
  at: number;
  size: number;
}

/** How alike a window must be to the stored phrase: less when a neighbour is the one from the time of learning, more when it is a window of plain short words. */
function needed(c: Correction, spot: Spot): number {
  const { words, at, size } = spot;
  if ((!!c.left && words[at - 1]?.key === c.left) || (!!c.right && words[at + size]?.key === c.right)) return NEAR_MATCH;
  if (!words.slice(at, at + size).every((w) => w.key.length <= PLAIN_WORD)) return CLOSE_MATCH;
  return c.left || c.right ? Infinity : SAME_MATCH;
}

/** How alike the window is to the stored phrase, 0 when it is too different in length, the phrase itself, or already the right words, or does not clear the bar. */
function score(c: Correction, spot: Spot): number {
  const { text, words, at, size } = spot;
  const spoken = text.slice(words[at]!.start, words[at + size - 1]!.end);
  const [a, b] = [compact(spoken), compact(c.heard)];
  if (a === b || a === compact(c.correct) || Math.abs(a.length - b.length) > b.length * LENGTH_SLACK) return 0;
  const alike = likeness(spoken, c.heard);
  return alike >= needed(c, spot) ? alike : 0;
}

/**
 * Places in the text that look like the misheard phrase of a stored correction without being it (an exact match was already fixed). Whole windows of one to three
 * words, close in spelling and sound, about as long as the stored phrase; windows of plain short words only when a neighbour is the one from the time of learning
 * (or, for a phrase with no neighbours on record, when they look all but the same).
 * The best matches come first, none overlap, and there are at most `MAX_HINTS`.
 */
export function findHints(text: string, corrections: readonly Correction[]): Hint[] {
  const words = wordsOf(text);
  const found: { hint: Hint; score: number }[] = [];
  for (const c of corrections.filter((x) => compact(x.heard).length >= MIN_LETTERS)) {
    for (let at = 0; at < words.length; at++) {
      for (let size = 1; size <= MAX_PHRASE && at + size <= words.length; size++) {
        if (size > 1 && !gap(text, words[at + size - 2]!, words[at + size - 1]!)) break;
        const spot = { text, words, at, size };
        const s = score(c, spot);
        const [first, last] = [words[at]!, words[at + size - 1]!];
        if (s) found.push({ hint: { heard: text.slice(first.start, last.end), correct: c.correct, start: first.start, end: last.end }, score: s });
      }
    }
  }
  const kept: Hint[] = [];
  for (const { hint } of found.sort((x, y) => y.score - x.score)) if (!kept.some((k) => hint.start < k.end && k.start < hint.end)) kept.push(hint);
  return kept.slice(0, MAX_HINTS).sort((x, y) => x.start - y.start);
}

/** The lines the writer's prompt gets, or nothing when there are no hints. */
export const hintBlock = (hints: readonly Pick<Hint, "heard" | "correct">[]): string =>
  hints.length ? `These words may have been misheard; fix them only where they clearly fit: ${hints.map((h) => `heard "${h.heard}" may be "${h.correct}"`).join("; ")}.` : "";

/**
 * A writer told about misheard words may fix those spots and word the rest as its template allows, but it must not bring in new words elsewhere:
 * none for a template that keeps the speaker's words, a quarter of the text for the others.
 */
export function keepsOtherWords(original: string, rewritten: string, hints: readonly Pick<Hint, "correct">[], template: TemplateId = DEFAULT_TEMPLATE): boolean {
  const known = new Set([...wordsOf(original), ...hints.flatMap((h) => wordsOf(h.correct))].flatMap((w) => [w.key, ...pieces(w.key), ...expansions(w.key)]));
  const fresh = wordsOf(rewritten).filter((w) => !known.has(w.key) && !pieces(w.key).every((p) => known.has(p))).length;
  return fresh <= (TEMPLATES[template].keepsWords ? 0 : Math.ceil(wordsOf(original).length / 4));
}

/** The parts of a hyphenated or apostrophe word: "save-dev" is "save" and "dev". */
const pieces = (key: string): string[] => key.split(/['’-]/).filter(Boolean);

/** What a contraction stands for when it is written out: "don't" is "do not", "it's" is "it is". */
function expansions(key: string): string[] {
  if (key === "can't" || key === "can’t") return ["cannot", "can", "not"];
  if (key === "won't" || key === "won’t") return ["will", "not"];
  const not = /^(.+)n['’]t$/.exec(key);
  if (not) return [not[1]!, "not"];
  const tail = /^(.+)['’](s|re|ve|ll|d|m)$/.exec(key);
  if (!tail) return [];
  const writtenOut: Record<string, string[]> = { s: ["is", "has"], re: ["are"], ve: ["have"], ll: ["will"], d: ["would", "had"], m: ["am"] };
  return [tail[1]!, ...writtenOut[tail[2]!]!];
}
