import { learnCorrections, type Candidate } from "./learn";
import { wordsOf } from "./words";

/** Words of the dictation that must still stand in the field, in order, for the text to be recognised as the same one. */
const SAME_SHARE = 0.6;
/** How far the edited text may be longer or shorter than the dictation, in words. */
const LENGTH_SLACK = 3;
/** The dictation starts at one of its first words; the first one or two may have been the ones that were fixed. */
const HEAD_WORDS = 3;
/** Longest dictation (in words) that is looked for in a field, and most places in the field that are compared with it: the work stays bounded for any field. */
const MAX_DICTATION = 200;
const MAX_STARTS = 100;

function commonLength(a: string[], b: string[]): number {
  let row = Array.from({ length: b.length + 1 }, () => 0);
  for (const x of a) {
    const next = [0];
    for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j]! + 1 : Math.max(row[j + 1]!, next[j]!));
    row = next;
  }
  return row[b.length]!;
}

/**
 * The stretch of `field` that is the dictated text after the person edited it: the run of words, about as long as the dictation, that shares the most
 * words with it in order. Undefined when no stretch shares enough (the text was moved, deleted or rewritten).
 */
export function editedRegion(field: string, pasted: string): string | undefined {
  const [p, w] = [wordsOf(pasted).map((x) => x.key), wordsOf(field)];
  if (p.length < 2 || p.length > MAX_DICTATION) return undefined;
  const heads = new Set(p.slice(0, HEAD_WORDS));
  const found = new Set<number>();
  w.forEach((x, i) => heads.has(x.key) && [0, 1, 2].forEach((back) => i - back >= 0 && found.add(i - back)));
  // The dictation is lately typed: of a field with very many look-alike starts, the last ones are tried.
  const starts = [...found].slice(-MAX_STARTS);
  let best: { start: number; length: number; shared: number } | undefined;
  for (const start of starts) {
    for (let length = Math.max(1, p.length - LENGTH_SLACK); length <= p.length + LENGTH_SLACK && start + length <= w.length; length++) {
      const shared = commonLength(
        p,
        w.slice(start, start + length).map((x) => x.key),
      );
      if (!best || shared > best.shared || (shared === best.shared && Math.abs(length - p.length) < Math.abs(best.length - p.length))) best = { start, length, shared };
    }
  }
  if (!best || best.shared < Math.max(2, Math.ceil(p.length * SAME_SHARE))) return undefined;
  return field.slice(w[best.start]!.start, w[best.start + best.length - 1]!.end);
}

/** The fixes in a field's text after an edit; undefined when the dictated text is not found in it. */
export function learnFromField(pasted: string, field: string): Candidate[] | undefined {
  const region = editedRegion(field, pasted);
  return region === undefined ? undefined : learnCorrections(pasted, region);
}

/** The fixes in a selected piece of the edited text: the whole dictation, or part of it. */
export function learnFromSelection(pasted: string, selection: string): Candidate[] {
  const whole = learnCorrections(pasted, selection);
  if (whole.length) return whole;
  const part = editedRegion(pasted, selection);
  return part === undefined ? [] : learnCorrections(part, selection);
}
