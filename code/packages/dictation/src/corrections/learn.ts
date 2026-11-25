import { compact, likeness } from "./similarity";
import { hasDigits, isFunctionWord, looksTechnical, wordsOf, type Word } from "./words";

/** One fix found in an edit: the words that were pasted, the words that replaced them, and the words on each side. */
export interface Candidate {
  heard: string;
  correct: string;
  /** The word before the phrase, lower case. */
  left?: string;
  /** The word after the phrase, lower case. */
  right?: string;
}

/** Longest neighbour word kept with a fix (the settings keep no more). */
const MAX_NEIGHBOUR = 40;
/** Longest phrase on either side of a fix. */
export const MAX_PHRASE = 3;
/** The edit may change at most this many separate places, and at most half of the words. */
const MAX_HUNKS = 3;
const MAX_WORDS = 400;
/** A hand edit may change this many words in all. */
const MAX_HAND_WORDS = 6;
/** Below this likeness the new words are a different word, not a better hearing of the old ones. */
const MIN_LIKENESS = 0.75;

interface Hunk {
  /** Word indexes, end exclusive. */
  from: number;
  to: number;
  newFrom: number;
  newTo: number;
}

/** The pasted text and the edited text, each as words. */
interface Edit {
  pasted: string;
  edited: string;
  a: Word[];
  b: Word[];
}

const same = (x: Word | undefined, y: Word | undefined): boolean => !!x && !!y && x.key === y.key;

/** The length of the longest common word sequence for every pair of tails, so a walk from the start can tell which side to move. */
function commonTails(a: Word[], b: Word[]): number[][] {
  const lcs = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = same(a[i], b[j]) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  return lcs;
}

/** The edit as runs of changed words, from the longest common sequence of the two word lists (compared without capitals). */
function hunks({ a, b }: Edit): Hunk[] {
  const lcs = commonTails(a, b);
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (same(a[i], b[j])) {
      i++;
      j++;
      continue;
    }
    const start = { from: i, newFrom: j };
    while ((i < a.length || j < b.length) && !same(a[i], b[j])) {
      if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) i++;
      else j++;
    }
    out.push({ ...start, to: i, newTo: j });
  }
  return out;
}

/** A neighbour in the same phrase: only a space between it and the next word. */
const joined = (text: string, left: Word | undefined, right: Word | undefined): boolean => !!left && !!right && /^[ \t]+$/.test(text.slice(left.end, right.start));

/** Both texts hold a neighbour of the hunk at these word positions, and each is in the same phrase. */
const near = (e: Edit, x: number, y: number): boolean => joined(e.pasted, e.a[x], e.a[x + 1]) && joined(e.edited, e.b[y], e.b[y + 1]);

/** Words around a fix that equal in letters but differ in capitals ("code" and "Code") belong to the fix: the person retyped them. */
function absorbCase(h: Hunk, e: Edit): Hunk {
  const g = { ...h };
  const retyped = (x: number, y: number): boolean => same(e.a[x], e.b[y]) && e.a[x]!.text !== e.b[y]!.text;
  while (g.to - g.from < MAX_PHRASE && retyped(g.to, g.newTo) && near(e, g.to - 1, g.newTo - 1)) [g.to, g.newTo] = [g.to + 1, g.newTo + 1];
  while (g.to - g.from < MAX_PHRASE && retyped(g.from - 1, g.newFrom - 1) && near(e, g.from - 1, g.newFrom - 1)) [g.from, g.newFrom] = [g.from - 1, g.newFrom - 1];
  return g;
}

const phrase = (text: string, words: Word[]): string => (words.length ? text.slice(words[0]!.start, words[words.length - 1]!.end) : "");
const letters = (words: Word[]): number => words.reduce((n, w) => n + w.key.length, 0);

/** A single short word ("good") turns up in ordinary text, so the fix takes the word before it, else the word after, to make a phrase ("VS Good"). */
function widen(h: Hunk, e: Edit): Hunk {
  if (h.to - h.from !== 1 || letters(e.a.slice(h.from, h.to)) >= 6) return h;
  const [before, after] = [e.a[h.from - 1], e.a[h.to]];
  if (before && !isFunctionWord(before.key) && near(e, h.from - 1, h.newFrom - 1)) return { ...h, from: h.from - 1, newFrom: h.newFrom - 1 };
  return after && !isFunctionWord(after.key) && near(e, h.to - 1, h.newTo - 1) ? { ...h, to: h.to + 1, newTo: h.newTo + 1 } : h;
}

/** The words with the text stuck to them on both sides ("example.com" around "com"), to tell a link or a file name. */
function surround(text: string, words: Word[]): string {
  const [first, last] = [words[0]!, words[words.length - 1]!];
  return text.slice(text.slice(0, first.start).search(/\S*$/), last.end + (/^\S*/.exec(text.slice(last.end))?.[0].length ?? 0));
}

/** The longest ending that makes one word the other's inflection ("meeting", "meetings"; "work", "worked"). */
const MAX_ENDING = 3;
const MIN_STEM = 3;

const ENDINGS = ["ing", "ed", "es", "ly", "s", "d"];

/** The phrase without a common ending on its last word ("meetings" is "meeting"), when enough of the word is left. */
const stem = (s: string): string => {
  const ending = ENDINGS.find((e) => s.endsWith(e) && s.length - e.length >= MIN_STEM);
  return ending ? s.slice(0, -ending.length) : s;
};

/** The two phrases differ only by an ending on one of them: a grammar edit, not a mishearing. */
function inflected(x: string, y: string): boolean {
  const [a, b] = [compact(x), compact(y)];
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length > short.length && long.length - short.length <= MAX_ENDING && long.startsWith(short)) return true;
  return a !== b && stem(a) === stem(b);
}

/** A fix of words with figures or in a link, or one that only swaps function words or capitals, is not a misheard word. */
function plausible(h: Hunk, e: Edit, byHand: boolean): boolean {
  const [old, now] = [e.a.slice(h.from, h.to), e.b.slice(h.newFrom, h.newTo)];
  if (!old.length || !now.length || old.length > MAX_PHRASE || now.length > MAX_PHRASE || (!byHand && Math.abs(old.length - now.length) > 1)) return false;
  if (hasDigits(phrase(e.pasted, old) + phrase(e.edited, now)) || looksTechnical(surround(e.pasted, old) + surround(e.edited, now))) return false;
  if (old.map((w) => w.key).join(" ") === now.map((w) => w.key).join(" ") || inflected(phrase(e.pasted, old), phrase(e.edited, now))) return false;
  return !(old.every((w) => isFunctionWord(w.key)) && now.every((w) => isFunctionWord(w.key)));
}

/** The fix a hunk stands for, with its neighbours; undefined when the new words are not close enough to the old ones. */
function candidate(h: Hunk, e: Edit, byHand: boolean): Candidate | undefined {
  const [old, now] = [e.a.slice(h.from, h.to), e.b.slice(h.newFrom, h.newTo)];
  const [heard, correct] = [phrase(e.pasted, old), phrase(e.edited, now)];
  if (!byHand && likeness(heard, correct) < MIN_LIKENESS) return undefined;
  const [left, right] = [e.a[h.from - 1], e.a[h.to]];
  const fits = (w: Word | undefined): w is Word => !!w && w.key.length <= MAX_NEIGHBOUR;
  return { heard, correct, ...(fits(left) && { left: left.key }), ...(fits(right) && { right: right.key }) };
}

/**
 * The fixes a person made when they edited pasted text. Only local replacements of one to three words that look or sound like what was there count;
 * a rewrite, a changed figure, a link, a swap of function words or a synonym gives nothing. The edit must stay a small part of the text.
 * An edit made on purpose in the Fix dialog (`byHand`) is a correction whatever the new words look or sound like: one to three words changed in up to three
 * places, at most six words in all and no more than half of a text longer than three words.
 */
export function learnCorrections(pasted: string, edited: string, byHand = false): Candidate[] {
  const e: Edit = { pasted, edited, a: wordsOf(pasted), b: wordsOf(edited) };
  if (!e.a.length || !e.b.length || e.a.length > MAX_WORDS || e.b.length > MAX_WORDS) return [];
  const raw = hunks(e);
  const found = raw.map((h) => absorbCase(h, e));
  const size = Math.max(e.a.length, e.b.length);
  const changed = (hs: Hunk[]): number => hs.reduce((n, h) => n + Math.max(h.to - h.from, h.newTo - h.newFrom), 0);
  // By hand, the words that only changed their capitals are not counted: "cloud code" to "Claude Code" changes one word.
  const tooMuch = byHand ? changed(raw) > MAX_HAND_WORDS || (size > MAX_PHRASE && changed(raw) / size > 0.5) : changed(found) / size > 0.5;
  if (!found.length || found.length > MAX_HUNKS || tooMuch) return [];
  const out = new Map<string, Candidate>();
  for (const hunk of found.filter((h) => plausible(h, e, byHand))) {
    const c = candidate(byHand ? hunk : widen(hunk, e), e, byHand);
    if (c) out.set(`${c.heard.toLowerCase()}>${c.correct}`, out.get(`${c.heard.toLowerCase()}>${c.correct}`) ?? c);
  }
  return [...out.values()];
}
