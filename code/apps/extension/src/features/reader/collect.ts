import { hasWord } from "@speakkit/player/sentences";
import type { ExtractOptions, Piece } from "./types";

/** Walks the DOM and gathers the text runs worth reading: one run per block element, each mapped back to its text nodes. */
const BOUNDARY = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "figcaption",
  "figure",
  "td",
  "th",
  "tr",
  "table",
  "thead",
  "tbody",
  "dd",
  "dt",
  "dl",
  "ul",
  "ol",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "nav",
  "pre",
  "hr",
  "details",
  "summary",
  "address",
  "body",
]);
const SEMANTIC = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "dd", "dt", "summary"]);
const NEVER = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "select",
  "option",
  "textarea",
  "input",
  "button",
  "dialog",
  "img",
  "picture",
  "map",
  "head",
  "math",
]);
const CODEISH = new Set(["pre", "code", "kbd", "samp"]);
const SR_ONLY = /(?:^|\s)(?:sr-only|visually-hidden|screen-reader-text|screenreader|a11y-hidden)(?:\s|$)/;
const REF_CLASS = /(?:^|\s)(?:reference|mw-ref|footnote-ref|noteref|citation|cite-ref)(?:\s|$)/;
const CITE_TEXT = /^\s*\[?\s*(?:\d{1,3}(?:\s*[,–-]\s*\d{1,3})*|[a-z]|[*†‡§]+)\s*\]?\s*$/i;
const NAVISH_ROLE = new Set(["navigation", "complementary", "banner", "contentinfo", "search", "form", "dialog", "alertdialog", "menu", "menubar", "toolbar", "tablist"]);
const CITATION_TOKEN = "\\[(?:\\d{1,3}(?:\\s*[,–-]\\s*\\d{1,3})*|[a-z]|citation needed|note \\d{1,2})\\]";
const NEEDS_REWRITE = /[[\n\r\t\f\v ]|  |https?:\/\/|www\./;
const REWRITE = new RegExp(`(\\s{2,}|[^\\S ]+)|(${CITATION_TOKEN})|((?:https?:\\/\\/|www\\.)\\S{20,})`, "gi");

interface Run {
  el: Element;
  tag: string;
  text: string;
  pieces: Piece[];
}

export class Collector {
  blocks: Run[] = [];
  private cur: Run | null = null;
  private boundary: Element;
  private sel: boolean;
  private o: ExtractOptions;
  constructor(root: Element, o: ExtractOptions) {
    this.boundary = root;
    this.o = o;
    this.sel = !!o.selection;
  }

  run(root: Element) {
    this.walk(root);
    this.flush();
    return this.blocks;
  }

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
      case "nav":
      case "aside":
      case "form":
        return !this.sel && sk.navigation;
      case "header":
      case "footer":
        return !this.sel && sk.navigation && !e.closest("article,main,[role=main]");
      case "figcaption":
        return !this.sel && sk.captions;
      case "sup":
        return !this.sel && sk.citations && CITE_TEXT.test(e.textContent ?? "");
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
      if (n.nodeType === 3) {
        this.text(n as Text);
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (sel && !sel.intersectsNode(n)) continue;
      const e = n as Element;
      const tag = e.localName;
      if (tag === "br" || tag === "wbr") {
        this.space();
        continue;
      }
      if (this.skipEl(e, tag)) continue;
      const isB = BOUNDARY.has(tag);
      if (isB) {
        this.flush();
      }
      const prev = this.boundary;
      if (isB) this.boundary = e;
      this.walk(e);
      if (isB) {
        this.flush();
        this.boundary = prev;
      }
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
    if (last && last.node === node && linear && last.ne - last.ns === last.te - last.ts && last.ne === ns) {
      last.ne = ne;
      last.te = ts + s.length;
    } else c.pieces.push({ node, ns, ne, ts, te: ts + s.length });
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
    if (!NEEDS_REWRITE.test(data)) {
      this.plain(node, a, b, data);
      return;
    }
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
          if (c && c.text.endsWith(" ") && (nx === undefined || /[.,;:!?)]/.test(nx))) {
            c.text = c.text.slice(0, -1);
            const p = c.pieces[c.pieces.length - 1]!;
            if (p.te - p.ts <= 1) c.pieces.pop();
            else {
              p.te--;
              p.ne--;
            }
          }
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
      if (p.te - p.ts <= 1) c.pieces.pop();
      else {
        p.te--;
        p.ne--;
      }
    }
    if (!c.text || !hasWord(c.text)) return;
    const sem = SEMANTIC.has(c.tag);
    if (!sem) {
      const min = c.tag === "td" || c.tag === "th" ? 30 : 40;
      if (c.text.length < min || c.text.indexOf(" ") < 0) return;
    }
    this.blocks.push(c);
  }
}
