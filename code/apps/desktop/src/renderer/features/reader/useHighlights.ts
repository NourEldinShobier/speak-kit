import { useEffect, type RefObject } from "react";
import type { Match, ReaderSentence, WordSpan } from "./model";

const NAMES = ["sk-sentence", "sk-word", "sk-find", "sk-find-current"] as const;

export function rangeIn(root: HTMLElement, block: number, start: number, end: number): Range | null {
  const node = root.querySelector(`[data-block="${block}"]`)?.firstChild;
  if (!node) return null;
  const r = new Range();
  r.setStart(node, start);
  r.setEnd(node, Math.min(end, node.textContent?.length ?? end));
  return r;
}

function set(name: (typeof NAMES)[number], ranges: (Range | null)[]) {
  const live = ranges.filter((r): r is Range => !!r);
  if (live.length) CSS.highlights.set(name, new Highlight(...live));
  else CSS.highlights.delete(name);
}

/** CSS Custom Highlight API: nothing in the text DOM changes while the reading moves. */
export function useHighlights(root: RefObject<HTMLElement | null>, p: { sentence: ReaderSentence | undefined; word: WordSpan | undefined; matches: Match[]; current: number }) {
  useEffect(() => {
    const el = root.current;
    set("sk-sentence", el && p.sentence ? [rangeIn(el, p.sentence.block, p.sentence.start, p.sentence.end)] : []);
  }, [root, p.sentence]);
  useEffect(() => {
    const el = root.current;
    const s = p.sentence;
    set("sk-word", el && s && p.word ? [rangeIn(el, s.block, s.start + p.word.start, s.start + p.word.end)] : []);
  }, [root, p.sentence, p.word]);
  useEffect(() => {
    const el = root.current;
    set("sk-find", el ? p.matches.map((m) => rangeIn(el, m.block, m.start, m.end)) : []);
    const cur = p.matches[p.current];
    set("sk-find-current", el && cur ? [rangeIn(el, cur.block, cur.start, cur.end)] : []);
  }, [root, p.matches, p.current]);
  useEffect(() => () => NAMES.forEach((n) => CSS.highlights.delete(n)), []);
}
