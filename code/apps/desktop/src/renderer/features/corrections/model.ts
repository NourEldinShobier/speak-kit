import { isCommonPhrase, learnCorrections, remember, sameText, type Candidate, type Term } from "@speakkit/dictation";

/** The fixes found when `edited` is `original` after the person fixed it. */
export const suggestionsFor = (original: string, edited: string): Candidate[] => learnCorrections(original, edited);

export const fixLabel = (f: Pick<Candidate, "heard" | "correct">): string => `${f.heard} → ${f.correct}`;

/** The chosen fixes saved as words, for every program or for `app`; `source` is the history entry they were fixed in, which counts once. */
export function saveFixes(list: readonly Term[], fixes: readonly Candidate[], opts: { now: number; app?: string | undefined; source?: string }): Term[] {
  return fixes.reduce<Term[]>((acc, fix) => remember(acc, fix, { now: opts.now, confirmed: true, ...(opts.app && { app: opts.app }), ...(opts.source && { source: opts.source }) }), [...list]);
}

/** Every fix is in the list as a heard-as spelling of its word; false when a full list, or a word with the most spellings, could not take one. */
export const keepsAll = (list: readonly Term[], fixes: readonly Candidate[]): boolean =>
  fixes.every((f) => list.some((t) => sameText(t.word, f.correct) && t.soundsLike.some((s) => sameText(s, f.heard))));

/** Heard words that are all everyday words would also change sentences that were right elsewhere, so the fix starts out limited to the program. */
export const limitByDefault = (fixes: readonly Pick<Candidate, "heard">[]): boolean => fixes.length > 0 && fixes.every((f) => isCommonPhrase(f.heard));

/** The scope box of the Fix dialog: the program the dictation went into, by its name and file name. */
export const scopeLabel = (item: { app: string; appName?: string | undefined }): string =>
  `Only when dictating into ${item.appName && item.appName !== item.app ? `${item.appName} (${item.app})` : item.app}`;
