/** Whether the page changed enough since the conversation began that its model should be given the new text ("Page changed" / Update). */

/** Change, in characters of main text, that makes the page "changed": a quarter of what the conversation started with, at least this much. */
export const CHURN_MIN = 1500;
/** A changed or added piece of text shorter than this is a counter, a clock or a typing indicator, not content. */
const TINY_CHARS = 120;
const INERT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
const COMMENT = 8;

/** The part of a MutationRecord this reads (tests pass plain objects). */
export interface Mutation {
  type: string;
  target: { nodeName?: string; textContent: string | null; parentElement?: { closest?(selector: string): unknown } | null };
  addedNodes: Iterable<{ nodeType: number; nodeName: string; textContent: string | null }>;
}

const long = (text: string | null) => (text ?? "").length >= TINY_CHARS;

/** True when a batch of mutations may have changed the content: it ignores scripts, styles, templates, comments and short text changes such as a ticking clock. */
export function mayHaveChangedContent(records: Mutation[]): boolean {
  return records.some((r) => {
    if (r.target.parentElement?.closest?.("script,style,template,noscript") || INERT.has(r.target.nodeName ?? "")) return false;
    if (r.type === "characterData") return long(r.target.textContent);
    return [...r.addedNodes].some((n) => n.nodeType !== COMMENT && !INERT.has(n.nodeName) && long(n.textContent));
  });
}

/** The page changed when the length of its main text moved by more than a quarter of the length the conversation started with (at least CHURN_MIN). */
export const pageChanged = (before: number, now: number) => Math.abs(now - before) > Math.max(CHURN_MIN, before / 4);
