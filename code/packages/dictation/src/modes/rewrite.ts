import { keepsOtherWords, type Hint } from "../corrections/hints";
import { dropFinalStop, isNumbersOnly } from "../rules";
import { DEFAULT_TEMPLATE, TEMPLATES, type TemplateId } from "./templates";

/** The clean-up choices about capitals and the final full stop, which the rewrite must not undo. */
export interface RewriteStyle {
  capitals: "sentence" | "keep";
  stripFinalStop: boolean;
  /** The wording of the task; the app default when absent. */
  template?: TemplateId;
}
const SENTENCE_STYLE: RewriteStyle = { capitals: "sentence", stripFinalStop: false };

/** The writer model. It gets the text, spots that may be misheard words, and a signal that fires when the person skips the rewrite; it must stop when it does. */
export interface Rewriter {
  rewrite(req: { text: string; signal: AbortSignal; style?: RewriteStyle; hints?: Hint[] }): Promise<string>;
}

export type RewriteOutcome = "rewritten" | "skipped" | "failed" | "numbers-only" | "changed-facts" | "changed-style" | "changed-words";

const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(" ");
const upperCount = (s: string): number => (s.match(/\p{Lu}/gu) ?? []).length;
const listLines = (s: string): number => (s.match(/^\s*(?:[-*•]|\d+[.)])\s/gm) ?? []).length;

/** A rewrite may change wording and never the figures; it may change a dictated list only when the template's job is to make or merge lists. */
export const keepsFacts = (original: string, rewritten: string, template: TemplateId = DEFAULT_TEMPLATE): boolean =>
  digits(original) === digits(rewritten) && (!TEMPLATES[template].keepsLists || listLines(original) === listLines(rewritten));

/** The writer's answer, or null when it throws (also at once, before any await). */
async function ask(rewriter: Rewriter, req: { text: string; signal: AbortSignal; style: RewriteStyle; hints?: Hint[] }): Promise<string | null> {
  try {
    return await rewriter.rewrite(req);
  } catch {
    return null;
  }
}

/**
 * Runs the rewrite and waits for the writer for as long as it works; only `skip` (the person's choice) ends the wait early. Whatever goes wrong (a skip,
 * an error, an empty answer, changed figures, new words away from the misheard spots the writer was told about) gives back the text as said. Numbers-only text is never sent.
 */
export async function rewritePass(req: { text: string; rewriter: Rewriter; skip: AbortSignal; style?: RewriteStyle; hints?: Hint[] }): Promise<{ text: string; outcome: RewriteOutcome }> {
  const { text, rewriter, skip, hints = [] } = req;
  const style = req.style ?? SENTENCE_STYLE;
  if (isNumbersOnly(text)) return { text, outcome: "numbers-only" };
  if (skip.aborted) return { text, outcome: "skipped" };
  const skipped = new Promise<"skipped">((resolve) => skip.addEventListener("abort", () => resolve("skipped"), { once: true }));
  const answer = await Promise.race([ask(rewriter, { text: text.trimEnd(), signal: skip, style, ...(hints.length && { hints }) }), skipped]);
  if (answer === "skipped") return { text, outcome: "skipped" };
  if (answer === null || !answer.trim()) return { text, outcome: "failed" };
  let next = answer.trim();
  // "Keep as spoken" cannot be restored, so a rewrite that moved capitals is dropped.
  if (style.capitals === "keep" && upperCount(next) !== upperCount(text)) return { text, outcome: "changed-style" };
  if (style.stripFinalStop) next = dropFinalStop(next);
  if (!keepsFacts(text, next, style.template)) return { text, outcome: "changed-facts" };
  if (hints.length && !keepsOtherWords(text, next, hints, style.template)) return { text, outcome: "changed-words" };
  // The text came with its trailing space (or not); the rewrite keeps that.
  return { text: /\s$/.test(text) ? `${next} ` : next, outcome: "rewritten" };
}
