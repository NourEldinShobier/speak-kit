import { splitMany } from "@speakkit/player/sentences";
import { Collector } from "./collect";
import type { Block, Extraction, ExtractOptions, Sentence } from "./types";

/** Page extraction: main-content detection, blocks with live Ranges, sentence splitting. */
export type { Block, Extraction, ExtractOptions, Piece, Sentence, SkipOpts } from "./types";
export { blockRange, sentenceIndexAt, sentenceRange, wordRange } from "./ranges";

// ---------------------------------------------------------------- main content

const SEMANTIC_ROOT = "article,main,[role=main]";

/** Dominant-subtree detection: score paragraphs, descend while one child holds >= 70% of the score. */
export function findMainRoot(doc: Document): Element {
  const body = doc.body;
  if (!body) return doc.documentElement;
  const scores = new Map<Element, number>();
  const ps = body.querySelectorAll("p,pre,blockquote,li");
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    const len = (p.textContent ?? "").length;
    if (len < 25) continue;
    const tag = p.tagName;
    if (tag === "LI" && p.querySelector("p")) continue;
    const s = (tag === "LI" ? 0.4 : 1) * (1 + Math.min(len / 100, 3));
    for (let a: Element | null = p.parentElement; a && a !== doc.documentElement; a = a.parentElement) scores.set(a, (scores.get(a) ?? 0) + s);
  }
  // nav/aside/footer score is discounted: remove their contribution from ancestors by not descending into them
  let cur: Element = body;
  let total = scores.get(body) ?? 0;
  if (total === 0) return doc.querySelector(SEMANTIC_ROOT) ?? body;
  for (;;) {
    let best: Element | null = null;
    let bs = 0;
    for (let c = cur.firstElementChild; c; c = c.nextElementSibling) {
      const s = scores.get(c) ?? 0;
      if (s > bs && !/^(NAV|ASIDE|FOOTER|HEADER)$/.test(c.tagName)) {
        bs = s;
        best = c;
      }
    }
    if (!best || bs < total * 0.7) break;
    cur = best;
    total = bs;
  }
  // a semantic wrapper just above the dominant node usually includes the title and byline
  const wrap = cur.closest(SEMANTIC_ROOT);
  if (wrap && wrap !== cur && wrap !== body && (scores.get(wrap) ?? 0) <= total * 1.6) return wrap;
  return cur;
}

// ---------------------------------------------------------------- public API

export function extract(doc: Document, opts: ExtractOptions): Extraction {
  const sel = opts.selection;
  let root: Element;
  if (sel) {
    const c = sel.commonAncestorContainer;
    root = c.nodeType === 1 ? (c as Element) : (c.parentElement ?? doc.body);
  } else root = findMainRoot(doc);
  const lang = opts.lang ?? (doc.documentElement.lang || "en");
  const t0 = performance.now();
  const runs = new Collector(root, opts).run(root);
  const t1 = performance.now();
  const blocks: Block[] = [];
  const sentences: Sentence[] = [];
  const splits = splitMany(
    runs.map((r) => r.text),
    lang,
  );
  const t2 = performance.now();
  for (let ri = 0; ri < runs.length; ri++) {
    const r = runs[ri]!;
    const first = sentences.length;
    for (const s of splits[ri]!) sentences.push({ text: s.text, block: blocks.length, start: s.start, end: s.end });
    if (sentences.length === first) continue;
    const range = doc.createRange();
    const a = r.pieces[0]!;
    const z = r.pieces[r.pieces.length - 1]!;
    range.setStart(a.node, a.ns);
    range.setEnd(z.node, z.ne);
    blocks.push({ el: r.el, tag: r.tag, text: r.text, pieces: r.pieces, first, count: sentences.length - first, range });
  }
  if (opts.timing) Object.assign(opts.timing, { collect: t1 - t0, split: t2 - t1, ranges: performance.now() - t2 });
  const h1 = root.querySelector("h1")?.textContent?.trim();
  return { title: (doc.title || h1 || "").trim(), root, blocks, sentences };
}

/** Estimated reading time in ms (architecture: 15 chars per second at 1x). */
export const estimateMs = (ex: Extraction, speed: number): number => {
  let n = 0;
  for (const s of ex.sentences) n += s.text.length;
  return (n / 15 / Math.max(0.5, speed)) * 1000;
};
