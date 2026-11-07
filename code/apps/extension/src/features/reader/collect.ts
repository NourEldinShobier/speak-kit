import { hasWord } from "@speakkit/player/sentences";
import type { ExtractOptions, Piece, SkipOpts } from "./types";

const words = (list: string) => new Set(list.split(" "));
const BOUNDARY = words(
  "p li h1 h2 h3 h4 h5 h6 blockquote figcaption figure td th tr table thead tbody dd dt dl ul ol div section article main header footer aside nav pre hr details summary address body",
);
const SEMANTIC = words("p li h1 h2 h3 h4 h5 h6 blockquote figcaption dd dt summary");
const NEVER = words("script style noscript template svg canvas iframe object embed video audio select option textarea input button dialog img picture map head math");
// Only code blocks are skipped; inline code, kbd and samp are words in a sentence ("run `hello`") and are read.
const CODEISH = words("pre");
const SR_ONLY = /(?:^|\s)(?:sr-only|visually-hidden|screen-reader-text|screenreader|a11y-hidden)(?:\s|$)/;
const REF_CLASS = /(?:^|\s)(?:reference|mw-ref|footnote-ref|noteref|citation|cite-ref)(?:\s|$)/;
const CITE_TEXT = /^\s*\[?\s*(?:\d{1,3}(?:\s*[,–-]\s*\d{1,3})*|[a-z]|[*†‡§]+)\s*\]?\s*$/i;
const NAVISH_ROLE = new Set(["navigation", "complementary", "banner", "contentinfo", "search", "form", "dialog", "alertdialog", "menu", "menubar", "toolbar", "tablist"]);
const CITATION_TOKEN = "\\[(?:\\d{1,3}(?:\\s*[,–-]\\s*\\d{1,3})*|[a-z]|citation needed|note \\d{1,2})\\]";
const NEEDS_REWRITE = /[[\n\r\t\f\v ]|  |https?:\/\/|www\./;
const REWRITE = new RegExp(`(\\s{2,}|[^\\S ]+)|(${CITATION_TOKEN})|((?:https?:\\/\\/|www\\.)\\S{20,})`, "gi");

/** The skip switches and whether the run is a selection (selection mode turns the nav, caption, code and citation filters off). */
interface Gate {
  sel: boolean;
  sk: SkipOpts;
}
type SkipRule = (e: Element, g: Gate) => boolean;

const isCite = (e: Element) => CITE_TEXT.test(e.textContent ?? "");
/** Rules for elements that have attributes; any match skips the element. */
const ATTRIBUTE_RULES: SkipRule[] = [
  (e) => e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true" || e.hasAttribute("inert"),
  (e) => SR_ONLY.test(e.getAttribute("class") ?? ""),
  (e, g) => !g.sel && g.sk.citations && REF_CLASS.test(e.getAttribute("class") ?? ""),
  (e, g) => {
    const role = !g.sel && g.sk.navigation ? e.getAttribute("role") : null;
    return !!role && NAVISH_ROLE.has(role);
  },
];
const navigation: SkipRule = (_, g) => !g.sel && g.sk.navigation;
const pageChrome: SkipRule = (e, g) => navigation(e, g) && !e.closest("article,main,[role=main]");
/** Rules by tag name; a tag without a rule falls back to the code filter. */
const TAG_RULES = new Map<string, SkipRule>([
  ["nav", navigation],
  ["aside", navigation],
  ["form", navigation],
  ["header", pageChrome],
  ["footer", pageChrome],
  ["figcaption", (_, g) => !g.sel && g.sk.captions],
  ["sup", (e, g) => !g.sel && g.sk.citations && isCite(e)],
  ["a", (e, g) => !g.sel && g.sk.citations && isCitationLink(e)],
]);
const isCitationLink = (e: Element) => {
  const h = e.getAttribute("href");
  return !!h && h.charCodeAt(0) === 35 /* # */ && /^#(?:cite|fn|ref|footnote|note)/i.test(h) && isCite(e);
};
/** Inline elements with only href/title cannot hide themselves: the style flush is skipped for them. */
const mayHide = (e: Element, tag: string) => BOUNDARY.has(tag) || !!e.getAttribute("class") || e.hasAttribute("style");

interface Run {
  el: Element;
  tag: string;
  text: string;
  pieces: Piece[];
}

/** A text node span: node[ns, ne). */
interface At {
  node: Text;
  ns: number;
  ne: number;
}

/** Appends a piece to a run, extending the last one when both map linearly onto the same node and touch. */
function addPiece(c: Run, p: Piece, linear: boolean) {
  const last = c.pieces[c.pieces.length - 1];
  if (last && last.node === p.node && linear && last.ne - last.ns === last.te - last.ts && last.ne === p.ns) {
    last.ne = p.ne;
    last.te = p.te;
  } else c.pieces.push(p);
}

/** Removes the last character of the run text and of the piece that maps it. */
function dropLastChar(c: Run) {
  c.text = c.text.slice(0, -1);
  const p = c.pieces[c.pieces.length - 1]!;
  if (p.te - p.ts <= 1) c.pieces.pop();
  else {
    p.te--;
    p.ne--;
  }
}

/** Walks the DOM and gathers the text runs worth reading: one run per block element, each mapped back to its text nodes. */
export class Collector {
  blocks: Run[] = [];
  private cur: Run | null = null;
  private boundary: Element;
  private sel: boolean;
  private o: ExtractOptions;
  private gate: Gate;
  constructor(root: Element, o: ExtractOptions) {
    this.boundary = root;
    this.o = o;
    this.sel = !!o.selection;
    this.gate = { sel: this.sel, sk: o.skip };
  }

  run(root: Element) {
    this.walk(root);
    this.flush();
    return this.blocks;
  }

  private skipEl(e: Element, tag: string): boolean {
    if (NEVER.has(tag)) return true;
    const g = this.gate;
    if (e.hasAttributes() && ATTRIBUTE_RULES.some((rule) => rule(e, g))) return true;
    if (mayHide(e, tag) && !e.checkVisibility({ checkVisibilityCSS: true })) return true;
    const rule = TAG_RULES.get(tag);
    return rule ? rule(e, g) : !g.sel && g.sk.code && CODEISH.has(tag);
  }

  private walk(el: Element) {
    // Flattened tree: a host with an open shadow root shows the root's content, and its own children only through <slot>s.
    for (let n = (el.shadowRoot ?? el).firstChild; n; n = n.nextSibling) this.visit(n);
  }

  private visit(n: Node) {
    if (n.nodeType === 3) {
      this.text(n as Text);
      return;
    }
    if (n.nodeType !== 1) return;
    const sel = this.o.selection;
    if (sel && this.inSelTree(n) && !sel.intersectsNode(n)) return;
    const e = n as Element;
    const tag = e.localName;
    if (tag === "br" || tag === "wbr") {
      this.space();
      return;
    }
    if (this.skipEl(e, tag)) return;
    if (tag === "slot") {
      const assigned = (e as HTMLSlotElement).assignedNodes({ flatten: true });
      if (assigned.length) {
        for (const a of assigned) this.visit(a);
        return;
      }
    }
    const isB = BOUNDARY.has(tag);
    if (isB) this.flush();
    const prev = this.boundary;
    if (isB) this.boundary = e;
    this.walk(e);
    if (isB) {
      this.flush();
      this.boundary = prev;
    }
  }

  private space() {
    const c = this.cur;
    const lp = c?.pieces[c.pieces.length - 1];
    if (c && lp && !c.text.endsWith(" ")) this.plain({ node: lp.node, ns: lp.ne, ne: lp.ne }, " ", true);
  }

  private open(): Run {
    return (this.cur ??= { el: this.boundary, tag: this.boundary.localName, text: "", pieces: [] });
  }

  /** Append `s` (already normalised) that maps onto node[ns, ne). linear when lengths match. */
  private plain(at: At, s: string, synthetic = false) {
    if (!s) return;
    const { node, ne } = at;
    let ns = at.ns;
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
    addPiece(c, { node, ns, ne, ts, te: ts + s.length }, ne - ns === s.length);
  }

  /** Range methods throw for nodes of another tree. The walk only enters a shadow root through a host that intersects the selection, so its content counts as selected. */
  private inSelTree(n: Node): boolean {
    return n.getRootNode() === this.o.selection!.commonAncestorContainer.getRootNode();
  }

  /** The part of `node` inside the selection as [from, to), the whole node when nothing is selected, or null when it is outside. */
  private clip(node: Text): [number, number] | null {
    const r = this.o.selection;
    const len = node.data.length;
    if (!r || !this.inSelTree(node)) return [0, len];
    // Siblings of the start/end node inside an intersecting element, and the block a triple-click spills into, are outside the range.
    if (node !== r.startContainer && r.comparePoint(node, 0) > 0) return null;
    if (node !== r.endContainer && r.comparePoint(node, len) < 0) return null;
    const a = node === r.startContainer ? r.startOffset : 0;
    const b = node === r.endContainer ? r.endOffset : len;
    return b > a ? [a, b] : null;
  }

  private text(node: Text) {
    const span = this.clip(node);
    if (!span) return;
    const [a, b] = span;
    const data = a === 0 && b === node.data.length ? node.data : node.data.slice(a, b);
    if (NEEDS_REWRITE.test(data)) this.rewrite(node, data, a);
    else this.plain({ node, ns: a, ne: b }, data);
  }

  /** Whitespace runs become one space, citations go, long URLs become "link"; the text between keeps its offsets. */
  private rewrite(node: Text, data: string, a: number) {
    let last = 0;
    REWRITE.lastIndex = 0;
    for (let m = REWRITE.exec(data); m; m = REWRITE.exec(data)) {
      if (m.index > last) this.plain({ node, ns: a + last, ne: a + m.index }, data.slice(last, m.index));
      this.replacement({ node, ns: a + m.index, ne: a + m.index + m[0].length }, m, data[m.index + m[0].length]);
      last = m.index + m[0].length;
    }
    if (last < data.length) this.plain({ node, ns: a + last, ne: a + data.length }, data.slice(last));
  }

  /** `next`: the character after the match. */
  private replacement(at: At, m: RegExpExecArray, next: string | undefined) {
    if (m[1] !== undefined) this.plain(at, " ");
    else if (m[2] !== undefined) this.citation(at, m[0], next);
    else if (m[3] !== undefined) this.plain(at, this.o.skip.urls ? "link" : m[0]);
  }

  /** A citation is dropped, with the space before it when it ends a clause; in selection mode or with the filter off it stays. */
  private citation(at: At, token: string, next: string | undefined) {
    if (this.sel || !this.o.skip.citations) {
      this.plain(at, token);
      return;
    }
    const c = this.cur;
    if (c && c.text.endsWith(" ") && (next === undefined || /[.,;:!?)]/.test(next))) dropLastChar(c);
  }

  private flush() {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    while (c.text.endsWith(" ")) dropLastChar(c);
    if (!c.text || !hasWord(c.text)) return;
    // Short runs outside real text blocks are page furniture (labels, buttons); what the user selected is read however short it is.
    if (!this.sel && !SEMANTIC.has(c.tag)) {
      const min = c.tag === "td" || c.tag === "th" ? 30 : 40;
      if (c.text.length < min || c.text.indexOf(" ") < 0) return;
    }
    this.blocks.push(c);
  }
}
