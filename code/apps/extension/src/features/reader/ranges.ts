import type { Block, Extraction } from "./types";

/** DOM position (node, offset) for a character offset in block text. `end` picks the end side at piece boundaries. */
function pointAt(b: Block, pos: number, end: boolean): [Text, number] {
  const ps = b.pieces;
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const p = ps[mid]!;
    if (end ? p.te < pos : p.te <= pos) lo = mid + 1;
    else hi = mid;
  }
  const p = ps[lo]!;
  if (p.ne - p.ns === p.te - p.ts) return [p.node, p.ns + Math.min(Math.max(pos - p.ts, 0), p.te - p.ts)];
  return [p.node, pos <= p.ts ? p.ns : p.ne];
}

/** Range of text offsets [from, to) inside a block. */
export function blockRange(doc: Document, b: Block, from: number, to: number): Range {
  const r = doc.createRange();
  const [sn, so] = pointAt(b, from, false);
  const [en, eo] = pointAt(b, to, true);
  r.setStart(sn, so);
  r.setEnd(en, eo);
  return r;
}

export function sentenceRange(doc: Document, ex: Extraction, index: number): Range | null {
  const s = ex.sentences[index];
  return s ? blockRange(doc, ex.blocks[s.block]!, s.start, s.end) : null;
}

/** Range of characters [from, to) inside sentence `index` (word highlight). */
export function wordRange(doc: Document, ex: Extraction, index: number, from: number, to: number): Range | null {
  const s = ex.sentences[index];
  return s ? blockRange(doc, ex.blocks[s.block]!, s.start + from, s.start + to) : null;
}

/** Character offset in the block text for a DOM position, or -1 when the position is outside the block's text. */
function textOffsetOf(b: Block, node: Node, offset: number): number {
  for (const p of b.pieces) if (p.node === node && offset >= p.ns && offset <= p.ne) return p.ne - p.ns === p.te - p.ts ? p.ts + (offset - p.ns) : offset <= p.ns ? p.ts : p.te;
  return -1;
}

/** Index of the first sentence at or after a DOM position ("read from here"). With `precise`, starts at the sentence containing the point. */
export function sentenceIndexAt(ex: Extraction, node: Node, offset = 0, precise = false): number {
  const bs = ex.blocks;
  let lo = 0;
  let hi = bs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const cmp = bs[mid]!.range.comparePoint(node, offset);
    if (cmp > 0) lo = mid + 1;
    else hi = mid;
  }
  const b = bs[lo];
  if (!b) return Math.max(0, ex.sentences.length - 1);
  if (precise) {
    const off = textOffsetOf(b, node, offset);
    if (off >= 0) for (let i = b.first; i < b.first + b.count; i++) if (ex.sentences[i]!.end > off) return i;
  }
  return b.first;
}
