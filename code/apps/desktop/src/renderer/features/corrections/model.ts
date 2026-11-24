import { confirmCorrections, isActive, learnCorrections, MAX_CORRECTIONS, MAX_PHRASE, remember, type Candidate, type Correction } from "@speakkit/dictation";

/** "Everywhere", or the program the fix is limited to. */
export const scopeText = (c: Pick<Correction, "app">): string => (c.app ? `Only in ${c.app}` : "Everywhere");

export const seenText = (c: Pick<Correction, "count">): string => (c.count === 1 ? "Seen once" : `Seen ${c.count} times`);

/** A suggestion waits for one click; an active fix applies to every dictation. */
export const statusText = (c: Correction): "Active" | "Suggested" => (isActive(c) ? "Active" : "Suggested");

export const countText = (n: number): string => `${n} of ${MAX_CORRECTIONS} fixes`;

/** The fixes found when `edited` is `original` after the person fixed it. */
export const suggestionsFor = (original: string, edited: string): Candidate[] => learnCorrections(original, edited);

export const fixLabel = (f: Pick<Candidate, "heard" | "correct">): string => `${f.heard} → ${f.correct}`;

/** The chosen fixes saved as active ones, for every program or for `app`; `source` is the history entry they were fixed in, which counts once. */
export function saveFixes(list: readonly Correction[], fixes: readonly Candidate[], opts: { now: number; app?: string | undefined; source?: string }): Correction[] {
  return fixes.reduce<Correction[]>((acc, fix) => remember(acc, fix, { now: opts.now, confirmed: true, ...(opts.app && { app: opts.app }), ...(opts.source && { source: opts.source }) }), [...list]);
}

export type HandCheck = "empty" | "too-long" | "same" | "app" | "full" | undefined;

/** Why a fix typed by hand cannot be added yet, if it cannot. */
export function checkByHand(list: readonly Correction[], heard: string, correct: string, app = ""): HandCheck {
  const [h, c] = [heard.trim(), correct.trim()];
  if (!h || !c) return "empty";
  if (h.split(" ").filter(Boolean).length > MAX_PHRASE) return "too-long";
  if (h.toLowerCase() === c.toLowerCase()) return "same";
  if (/[\s\\/]/.test(app.trim())) return "app";
  return list.length >= MAX_CORRECTIONS ? "full" : undefined;
}

export const HAND_TEXT: Record<Exclude<HandCheck, undefined>, string> = {
  empty: "",
  "too-long": "Heard needs one to three words.",
  same: "Heard and Should be differ only in capital letters. Add a replacement instead.",
  app: "Use the program file name, such as code.exe.",
  full: "The list is full. Delete a fix first.",
};

/** A fix typed by hand, active at once. */
export const addByHand = (list: readonly Correction[], input: { heard: string; correct: string; app?: string }, now: number): Correction[] =>
  saveFixes(list, [{ heard: input.heard, correct: input.correct }], { now, ...(input.app?.trim() && { app: input.app.trim() }) });

/** One click on a suggestion makes it a fix. */
export const acceptSuggestion = (list: readonly Correction[], id: string): Correction[] => confirmCorrections(list, [id]);
