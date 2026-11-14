import { dropFinalStop, isNumbersOnly } from "../rules";
import type { Clock } from "../types";

export const DEFAULT_REWRITE_DEADLINE_MS = 4000;
export const MIN_REWRITE_DEADLINE_MS = 1000;
export const MAX_REWRITE_DEADLINE_MS = 15_000;

/** The mode's choices about capitals and the final full stop, which the rewrite must not undo. */
export interface RewriteStyle {
  capitals: "sentence" | "keep" | "lower";
  stripFinalStop: boolean;
}
const SENTENCE_STYLE: RewriteStyle = { capitals: "sentence", stripFinalStop: false };

/** The writer model. It gets the text and a signal that fires at the deadline; it must stop when it does. */
export interface Rewriter {
  rewrite(req: { text: string; signal: AbortSignal; style?: RewriteStyle }): Promise<string>;
}

export type RewriteOutcome = "rewritten" | "deadline" | "failed" | "numbers-only" | "changed-facts" | "changed-style";

export const clampDeadline = (ms: number): number => (Number.isFinite(ms) ? Math.min(MAX_REWRITE_DEADLINE_MS, Math.max(MIN_REWRITE_DEADLINE_MS, Math.round(ms))) : DEFAULT_REWRITE_DEADLINE_MS);

const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(" ");
const upperCount = (s: string): number => (s.match(/\p{Lu}/gu) ?? []).length;
const listLines = (s: string): number => (s.match(/^\s*(?:[-*•]|\d+[.)])\s/gm) ?? []).length;

/** A rewrite may change wording, never the figures or the shape of a list the person dictated. */
export const keepsFacts = (original: string, rewritten: string): boolean => digits(original) === digits(rewritten) && listLines(original) === listLines(rewritten);

/** The writer's answer, or null when it throws (also at once, before any await). */
async function ask(rewriter: Rewriter, req: { text: string; signal: AbortSignal; style: RewriteStyle }): Promise<string | null> {
  try {
    return await rewriter.rewrite(req);
  } catch {
    return null;
  }
}

/**
 * Runs the rewrite with a hard deadline that covers everything, finding the writer included. Whatever goes wrong (no answer in time, an error,
 * an empty answer, changed figures) gives back the text as said. Numbers-only text is never sent.
 */
export async function rewritePass(req: {
  text: string;
  rewriter: Rewriter;
  deadlineMs: number;
  clock: Pick<Clock, "after">;
  style?: RewriteStyle;
}): Promise<{ text: string; outcome: RewriteOutcome }> {
  const { text, rewriter, clock } = req;
  const style = req.style ?? SENTENCE_STYLE;
  if (isNumbersOnly(text)) return { text, outcome: "numbers-only" };
  const ac = new AbortController();
  let cancel = (): void => {};
  const late = new Promise<"deadline">((resolve) => {
    cancel = clock.after(clampDeadline(req.deadlineMs), () => {
      ac.abort();
      resolve("deadline");
    });
  });
  try {
    const answer = await Promise.race([ask(rewriter, { text: text.trimEnd(), signal: ac.signal, style }), late]);
    if (answer === "deadline") return { text, outcome: "deadline" };
    if (answer === null || !answer.trim()) return { text, outcome: "failed" };
    let next = answer.trim();
    // Lower case is restored exactly; "keep as spoken" cannot be, so a rewrite that moved capitals is dropped.
    if (style.capitals === "lower") next = next.toLowerCase();
    if (style.capitals === "keep" && upperCount(next) !== upperCount(text)) return { text, outcome: "changed-style" };
    if (style.stripFinalStop) next = dropFinalStop(next);
    if (!keepsFacts(text, next)) return { text, outcome: "changed-facts" };
    // The text came with its trailing space (or not); the rewrite keeps that.
    return { text: /\s$/.test(text) ? `${next} ` : next, outcome: "rewritten" };
  } finally {
    cancel();
  }
}
