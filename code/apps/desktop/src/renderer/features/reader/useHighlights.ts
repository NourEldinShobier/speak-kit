import { useEffect, type RefObject } from "react";
import type { Match, ReaderSentence, WordSpan } from "./model";

const NAMES = ["sk-sentence", "sk-word", "sk-find", "sk-find-current"] as const;

interface TextSpan {
  block: number;
  start: number;
  end: number;
}

export function rangeIn(root: HTMLElement, span: TextSpan): Range | null {
  const node = root.querySelector(`[data-block="${span.block}"]`)?.firstChild;
  if (!node) return null;
  const r = new Range();
  r.setStart(node, span.start);
  r.setEnd(node, Math.min(span.end, node.textContent?.length ?? span.end));
  return r;
}

/**
 * The word as a span of the block. The word comes from a timer and can still belong to the previous sentence for one frame after the sentence
 * changed; a word that does not fit in the sentence is dropped, because a range past the end of the text node throws and the reader crashes.
 */
export function wordSpanIn(sentence: ReaderSentence, word: WordSpan | undefined): TextSpan | null {
  if (!word || word.end > sentence.end - sentence.start) return null;
  return { block: sentence.block, start: sentence.start + word.start, end: sentence.start + word.end };
}

function set(name: (typeof NAMES)[number], ranges: (Range | null)[]) {
  const live = ranges.filter((r): r is Range => !!r);
  if (live.length) CSS.highlights.set(name, new Highlight(...live));
  else CSS.highlights.delete(name);
}

/** CSS Custom Highlight API: nothing in the text DOM changes while the reading moves. */
export function useHighlights(root: RefObject<HTMLElement | null>, p: { sentence: ReaderSentence | undefined; word: WordSpan | undefined; matches: Match[]; current: number }) {
  const { sentence, word, matches, current } = p;
  useEffect(() => {
    const el = root.current;
    set("sk-sentence", el && sentence ? [rangeIn(el, sentence)] : []);
  }, [root, sentence]);
  useEffect(() => {
    const el = root.current;
    const span = sentence && wordSpanIn(sentence, word);
    set("sk-word", el && span ? [rangeIn(el, span)] : []);
  }, [root, sentence, word]);
  useEffect(() => {
    const el = root.current;
    set("sk-find", el ? matches.map((m) => rangeIn(el, m)) : []);
    const cur = matches[current];
    set("sk-find-current", el && cur ? [rangeIn(el, cur)] : []);
  }, [root, matches, current]);
  useEffect(() => () => NAMES.forEach((n) => CSS.highlights.delete(n)), []);
}
