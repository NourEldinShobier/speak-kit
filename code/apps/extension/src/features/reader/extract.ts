import type { Settings } from "@speakkit/protocol";

/**
 * Page extraction: main-content detection, blocks with live Ranges, sentence splitting.
 * Only type imports here, so this file also runs in tests without a bundler.
 */

export type SkipOpts = Settings["skip"];

/** A run of block text that maps back to one text node. When `ne - ns !== te - ts` the text was rewritten (whitespace run, URL -> "link"). */
export interface Piece { node: Text; ns: number; ne: number; ts: number; te: number }
export interface Block {
  el: Element;
  tag: string;
  text: string;
  pieces: Piece[];
  /** index of this block's first sentence in Extraction.sentences */
  first: number;
  count: number;
  /** live Range covering the block's spoken text */
  range: Range;
}
export interface Sentence { text: string; block: number; /** offsets inside Block.text */ start: number; end: number }
export interface Extraction { title: string; root: Element; blocks: Block[]; sentences: Sentence[] }
export interface ExtractOptions {
  skip: SkipOpts;
  /** Read only this range (selection mode: nav/aside/code filters are off, hidden and script filters stay). */
  selection?: Range;
  lang?: string;
  /** Filled with per-phase milliseconds (collect, split, ranges) when given. */
  timing?: Record<string, number>;
}

const MAX_SENTENCE = 300;
const MIN_SPLIT = 120;

// ---------------------------------------------------------------- sentences

const ABBR = /(?:\b(?:Dr|Mr|Mrs|Ms|Mx|Prof|Sr|Jr|St|Mt|vs|cf|Fig|Figs|Eq|Inc|Ltd|Co|Corp|Dept|Univ|Gen|Gov|Sen|Rep|Hon|Lt|Col|Sgt|Capt|Cmdr|Rev|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|approx|est|ca|vol|no|pp)\.|\b(?:e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|U\.N|Ph\.D|M\.D|B\.A|M\.A|et al|N\.B|a\.k\.a)\.|\b[A-Z]\.)$/;
const HAS_WORD = /[0-9A-Za-z\u00c0-\u1fff\u2c00-\ud7ff]/; // cheaper than \p{L}: Latin, Greek, Cyrillic, Arabic, Indic, CJK
const INNER_BOUNDARY = /[.!?…。！？]["'”’)\]]*\s+\S/;
const CLAUSE = /[;:](?=\s)|,(?=\s)|\s[—–-]\s|\s(?=(?:and|but|or|which|that|because|while|although|so)\s)/g;

const segmenters = new Map<string, Intl.Segmenter>();
const segmenterFor = (lang: string) => {
  let s = segmenters.get(lang);
  if (!s) {
    try { s = new Intl.Segmenter(lang, { granularity: "sentence" }); } catch { s = new Intl.Segmenter("en", { granularity: "sentence" }); }
    segmenters.set(lang, s);
  }
  return s;
};

/** Split a long sentence at clause boundaries so no piece exceeds `max` characters (when a boundary exists). */
export function capSentence(text: string, start: number, max = MAX_SENTENCE): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let from = 0;
  while (text.length - from > max) {
    const win = text.slice(from, from + max);
    let cut = -1;
    CLAUSE.lastIndex = 0;
    for (let m = CLAUSE.exec(win); m; m = CLAUSE.exec(win)) {
      const end = m.index + (m[0].trim() ? m[0].length : 0);
      if (end >= MIN_SPLIT) cut = end;
    }
    if (cut < 0) { const sp = win.lastIndexOf(" "); cut = sp >= MIN_SPLIT ? sp : max; }
    out.push({ start: start + from, end: start + from + cut });
    from += cut;
    while (text[from] === " ") from++;
  }
  if (from < text.length) out.push({ start: start + from, end: start + text.length });
  return out;
}

type Span = { text: string; start: number; end: number };
const PARA = String.fromCharCode(0x2029); // paragraph separator: ICU always breaks sentences here

/** Trim, merge abbreviations / stray punctuation, drop empties and cap length for one block, given raw segmenter spans. */
function finish(text: string, raw: { start: number; end: number }[]): Span[] {
  const segs: { start: number; end: number }[] = [];
  for (const r of raw) {
    const prev = segs[segs.length - 1];
    // merge: previous ended on an abbreviation, or this piece has no letters/digits (stray quote, bullet)
    if (prev && ((text.charCodeAt(prev.end - 1) === 46 && ABBR.test(text.slice(Math.max(prev.start, prev.end - 12), prev.end))) || !HAS_WORD.test(text.slice(r.start, r.end)))) prev.end = r.end;
    else segs.push({ start: r.start, end: r.end });
  }
  const out: Span[] = [];
  for (const sp of segs) {
    const t = text.slice(sp.start, sp.end);
    if (!HAS_WORD.test(t)) continue;
    if (t.length <= MAX_SENTENCE) out.push({ text: t, start: sp.start, end: sp.end });
    else for (const c of capSentence(t, sp.start)) out.push({ text: text.slice(c.start, c.end), start: c.start, end: c.end });
  }
  return out;
}

/**
 * Sentences of every text at once. Texts with a possible inner boundary go through ONE Intl.Segmenter pass joined by
 * U+2029 (a hard sentence break): about 4x faster than one pass per block on large pages.
 */
export function splitMany(texts: string[], lang = "en"): Span[][] {
  const need: number[] = [];
  for (let i = 0; i < texts.length; i++) if (INNER_BOUNDARY.test(texts[i]!)) need.push(i);
  const raw = new Map<number, { start: number; end: number }[]>();
  if (need.length) {
    const offs: number[] = [];
    let joined = "";
    for (const i of need) { offs.push(joined.length); joined += texts[i] + PARA; }
    let k = 0;
    for (const seg of segmenterFor(lang).segment(joined)) {
      while (k + 1 < need.length && seg.index >= offs[k + 1]!) k++;
      const body = seg.segment.trim();
      if (!body) continue;
      const base = offs[k]!;
      const start = seg.index - base + (seg.segment.length - seg.segment.trimStart().length);
      const list = raw.get(need[k]!) ?? [];
      list.push({ start, end: start + body.length });
      raw.set(need[k]!, list);
    }
  }
  return texts.map((t, i) => finish(t, raw.get(i) ?? [{ start: 0, end: t.length }]));
}

/** Sentences of one text as offset spans. Exported for tests. */
export const splitSentences = (text: string, lang = "en"): Span[] => splitMany([text], lang)[0]!;

// ---------------------------------------------------------------- text runs

const BOUNDARY = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "figure", "td", "th", "tr", "table", "thead", "tbody", "dd", "dt", "dl", "ul", "ol", "div", "section", "article", "main", "header", "footer", "aside", "nav", "pre", "hr", "details", "summary", "address", "body"]);
const SEMANTIC = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "dd", "dt", "summary"]);
const NEVER = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "video", "audio", "select", "option", "textarea", "input", "button", "dialog", "img", "picture", "map", "head", "math"]);
const CODEISH = new Set(["pre", "code", "kbd", "samp"]);
const SR_ONLY = /(?:^|\s)(?:sr-only|visually-hidden|screen-reader-text|screenreader|a11y-hidden)(?:\s|$)/;
const REF_CLASS = /(?:^|\s)(?:reference|mw-ref|footnote-ref|noteref|citation|cite-ref)(?:\s|$)/;
const CITE_TEXT = /^\s*\[?\s*(?:\d{1,3}(?:\s*[,–-]\s*\d{1,3})*|[a-z]|[*†‡§]+)\s*\]?\s*$/i;
const NAVISH_ROLE = new Set(["navigation", "complementary", "banner", "contentinfo", "search", "form", "dialog", "alertdialog", "menu", "menubar", "toolbar", "tablist"]);
const CITATION_TOKEN = "\\[(?:\\d{1,3}(?:\\s*[,–-]\\s*\\d{1,3})*|[a-z]|citation needed|note \\d{1,2})\\]";
const NEEDS_REWRITE = /[[\n\r\t\f\v ]|  |https?:\/\/|www\./;
const REWRITE = new RegExp(`(\\s{2,}|[^\\S ]+)|(${CITATION_TOKEN})|((?:https?:\\/\\/|www\\.)\\S{20,})`, "gi");

interface Run { el: Element; tag: string; text: string; pieces: Piece[] }

class Collector {
  blocks: Run[] = [];
  private cur: Run | null = null;
  private boundary: Element;
  private sel: boolean;
  private o: ExtractOptions;
  constructor(root: Element, o: ExtractOptions) { this.boundary = root; this.o = o; this.sel = !!o.selection; }

  run(root: Element) { this.walk(root); this.flush(); return this.blocks; }

  private skipEl(e: Element, tag: string): boolean {
    const sk = this.o.skip;
    if (NEVER.has(tag)) return true;
    if (e.hasAttributes()) {
      if (e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true" || e.hasAttribute("inert")) return true;
      const cls = e.getAttribute("class");
      if (cls) {
        if (SR_ONLY.test(cls)) return true;
        if (!this.sel && sk.citations && REF_CLASS.test(cls)) return true;
      }
      if (!this.sel && sk.navigation) {
        const role = e.getAttribute("role");
        if (role && NAVISH_ROLE.has(role)) return true;
      }
      // inline elements with only href/title cannot hide themselves: skip the style flush for them
      if ((cls || BOUNDARY.has(tag) || e.hasAttribute("style")) && !e.checkVisibility({ checkVisibilityCSS: true })) return true;
    } else if (BOUNDARY.has(tag) && !e.checkVisibility({ checkVisibilityCSS: true })) return true;
    switch (tag) {
      case "nav": case "aside": case "form": return !this.sel && sk.navigation;
      case "header": case "footer": return !this.sel && sk.navigation && !e.closest("article,main,[role=main]");
      case "figcaption": return !this.sel && sk.captions;
      case "sup": return !this.sel && sk.citations && CITE_TEXT.test(e.textContent ?? "");
      case "a": {
        if (this.sel || !sk.citations) return false;
        const h = e.getAttribute("href");
        return !!h && h.charCodeAt(0) === 35 /* # */ && /^#(?:cite|fn|ref|footnote|note)/i.test(h) && CITE_TEXT.test(e.textContent ?? "");
      }
    }
    return !this.sel && sk.code && CODEISH.has(tag);
  }

  private walk(el: Element) {
    const sel = this.o.selection;
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { this.text(n as Text); continue; }
      if (n.nodeType !== 1) continue;
      if (sel && !sel.intersectsNode(n)) continue;
      const e = n as Element;
      const tag = e.localName;
      if (tag === "br" || tag === "wbr") { this.space(); continue; }
      if (this.skipEl(e, tag)) continue;
      const isB = BOUNDARY.has(tag);
      if (isB) { this.flush(); }
      const prev = this.boundary;
      if (isB) this.boundary = e;
      this.walk(e);
      if (isB) { this.flush(); this.boundary = prev; }
    }
  }

  private space() {
    const c = this.cur;
    const lp = c?.pieces[c.pieces.length - 1];
    if (c && lp && !c.text.endsWith(" ")) this.plain(lp.node, lp.ne, lp.ne, " ", true);
  }

  private open(): Run {
    return (this.cur ??= { el: this.boundary, tag: this.boundary.localName, text: "", pieces: [] });
  }

  /** Append `s` (already normalised) that maps onto node[ns, ne). linear when lengths match. */
  private plain(node: Text, ns: number, ne: number, s: string, synthetic = false) {
    if (!s) return;
    const c = this.open();
    if (s[0] === " " && (c.text === "" || c.text.endsWith(" "))) {
      if (synthetic) return;
      s = s.slice(1);
      if (ne - ns === s.length + 1) ns++;
      if (!s) return;
    }
    if (c.text === "" && synthetic) return;
    const ts = c.text.length;
    c.text += s;
    const last = c.pieces[c.pieces.length - 1];
    const linear = ne - ns === s.length;
    if (last && last.node === node && linear && last.ne - last.ns === last.te - last.ts && last.ne === ns) { last.ne = ne; last.te = ts + s.length; }
    else c.pieces.push({ node, ns, ne, ts, te: ts + s.length });
  }

  private text(node: Text) {
    const r = this.o.selection;
    let a = 0;
    let b = node.data.length;
    if (r) {
      // Siblings of the start/end node inside an intersecting element, and the block a triple-click spills into, are outside the range.
      if (node !== r.startContainer && r.comparePoint(node, 0) > 0) return;
      if (node !== r.endContainer && r.comparePoint(node, node.data.length) < 0) return;
      if (node === r.startContainer) a = r.startOffset;
      if (node === r.endContainer) b = r.endOffset;
      if (b <= a) return;
    }
    const data = a === 0 && b === node.data.length ? node.data : node.data.slice(a, b);
    if (!NEEDS_REWRITE.test(data)) { this.plain(node, a, b, data); return; }
    const sk = this.o.skip;
    let last = 0;
    REWRITE.lastIndex = 0;
    for (let m = REWRITE.exec(data); m; m = REWRITE.exec(data)) {
      if (m.index > last) this.plain(node, a + last, a + m.index, data.slice(last, m.index));
      const s = a + m.index;
      const e = s + m[0].length;
      if (m[1] !== undefined) this.plain(node, s, e, " ");
      else if (m[2] !== undefined) {
        if (sk.citations && !this.sel) {
          const c = this.cur;
          const nx = data[m.index + m[0].length];
          if (c && c.text.endsWith(" ") && (nx === undefined || /[.,;:!?)]/.test(nx))) { c.text = c.text.slice(0, -1); const p = c.pieces[c.pieces.length - 1]!; if (p.te - p.ts <= 1) c.pieces.pop(); else { p.te--; p.ne--; } }
        } else this.plain(node, s, e, m[0]);
      } else if (m[3] !== undefined) this.plain(node, s, e, sk.urls ? "link" : m[0]);
      last = m.index + m[0].length;
    }
    if (last < data.length) this.plain(node, a + last, a + data.length, data.slice(last));
  }

  private flush() {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    // trim trailing space
    while (c.text.endsWith(" ")) {
      c.text = c.text.slice(0, -1);
      const p = c.pieces[c.pieces.length - 1]!;
      if (p.te - p.ts <= 1) c.pieces.pop(); else { p.te--; p.ne--; }
    }
    if (!c.text || !HAS_WORD.test(c.text)) return;
    const sem = SEMANTIC.has(c.tag);
    if (!sem) {
      const min = c.tag === "td" || c.tag === "th" ? 30 : 40;
      if (c.text.length < min || c.text.indexOf(" ") < 0) return;
    }
    this.blocks.push(c);
  }
}

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
      if (s > bs && !/^(NAV|ASIDE|FOOTER|HEADER)$/.test(c.tagName)) { bs = s; best = c; }
    }
    if (!best || bs < total * 0.7) break;
    cur = best; total = bs;
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
  const splits = splitMany(runs.map((r) => r.text), lang);
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

/** DOM position (node, offset) for a character offset in block text. `end` picks the end side at piece boundaries. */
function pointAt(b: Block, pos: number, end: boolean): [Text, number] {
  const ps = b.pieces;
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const p = ps[mid]!;
    if (end ? p.te < pos : p.te <= pos) lo = mid + 1; else hi = mid;
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
    if (cmp > 0) lo = mid + 1; else hi = mid;
  }
  const b = bs[lo];
  if (!b) return Math.max(0, ex.sentences.length - 1);
  if (precise) {
    const off = textOffsetOf(b, node, offset);
    if (off >= 0) for (let i = b.first; i < b.first + b.count; i++) if (ex.sentences[i]!.end > off) return i;
  }
  return b.first;
}

/** Estimated reading time in ms (architecture: 15 chars per second at 1x). */
export const estimateMs = (ex: Extraction, speed: number): number => {
  let n = 0;
  for (const s of ex.sentences) n += s.text.length;
  return (n / 15 / Math.max(0.5, speed)) * 1000;
};
