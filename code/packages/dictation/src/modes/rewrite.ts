import { isNumbersOnly } from "../rules";
import type { Clock } from "../types";

export const DEFAULT_REWRITE_DEADLINE_MS = 4000;
export const MIN_REWRITE_DEADLINE_MS = 1000;
export const MAX_REWRITE_DEADLINE_MS = 15_000;

/** The writer model. It gets the text and a signal that fires at the deadline; it must stop when it does. */
export interface Rewriter {
  rewrite(req: { text: string; signal: AbortSignal }): Promise<string>;
}

export type RewriteOutcome = "rewritten" | "deadline" | "failed" | "numbers-only" | "changed-facts";

export const clampDeadline = (ms: number): number => (Number.isFinite(ms) ? Math.min(MAX_REWRITE_DEADLINE_MS, Math.max(MIN_REWRITE_DEADLINE_MS, Math.round(ms))) : DEFAULT_REWRITE_DEADLINE_MS);

const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(" ");
const listLines = (s: string): number => (s.match(/^\s*(?:[-*•]|\d+[.)])\s/gm) ?? []).length;

/** A rewrite may change wording, never the figures or the shape of a list the person dictated. */
export const keepsFacts = (original: string, rewritten: string): boolean => digits(original) === digits(rewritten) && listLines(original) === listLines(rewritten);

/**
 * Runs the rewrite with a hard deadline that covers everything, finding the writer included. Whatever goes wrong (no answer in time, an error,
 * an empty answer, changed figures) gives back the text as said. Numbers-only text is never sent.
 */
export async function rewritePass(req: { text: string; rewriter: Rewriter; deadlineMs: number; clock: Pick<Clock, "after"> }): Promise<{ text: string; outcome: RewriteOutcome }> {
  const { text, rewriter, clock } = req;
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
    const answer = await Promise.race([(async () => rewriter.rewrite({ text: text.trimEnd(), signal: ac.signal }))().catch(() => "failed" as const), late]);
    if (answer === "deadline") return { text, outcome: "deadline" };
    if (answer === "failed" || !answer.trim()) return { text, outcome: "failed" };
    const next = answer.trim();
    if (!keepsFacts(text, next)) return { text, outcome: "changed-facts" };
    // The text came with its trailing space (or not); the rewrite keeps that.
    return { text: /\s$/.test(text) ? `${next} ` : next, outcome: "rewritten" };
  } finally {
    cancel();
  }
}
