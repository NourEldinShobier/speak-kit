import { learnCorrections, sameText, saveFix, type Candidate, type Term } from "@speakkit/dictation";

/** The fixes found when `edited` is `original` after the person fixed it. */
export const suggestionsFor = (original: string, edited: string): Candidate[] => learnCorrections(original, edited, true);

export const fixLabel = (f: Pick<Candidate, "heard" | "correct">): string => `${f.heard} → ${f.correct}`;

/** The fixes saved as words that apply at once; `app` is the program the dictation went into, which decides where each fix applies; `source` is the history entry, which counts once. */
export const saveFixes = (list: readonly Term[], fixes: readonly Candidate[], opts: { now: number; app?: string | undefined; source?: string }): Term[] =>
  fixes.reduce<Term[]>((acc, fix) => saveFix(acc, fix, opts), [...list]);

/** Every fix is in the list as a heard-as spelling of its word; false when a full list, or a word with the most spellings, could not take one. */
export const keepsAll = (list: readonly Term[], fixes: readonly Candidate[]): boolean =>
  fixes.every((f) => list.some((t) => sameText(t.word, f.correct) && t.soundsLike.some((s) => sameText(s, f.heard))));
