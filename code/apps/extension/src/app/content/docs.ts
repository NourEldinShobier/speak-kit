import type { ExtractReply, ReadDoc } from "@speakkit/protocol";
import { extract, extractFieldText, fieldSelection, findMainRoot, sentenceIndexAt, type Extraction } from "../../features/reader";
import type { Ctx, ReadMode } from "./context";

const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const MAX_DOCS = 4;
const ROOT_TTL_MS = 15000;
const POINT_TTL_MS = 60000;

/** The selected text as a Range, or undefined when nothing but whitespace is selected. */
export function currentSelection(): Range | undefined {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return undefined;
  const r = s.getRangeAt(0);
  return /\S/.test(r.toString()) ? r : undefined;
}

interface Point {
  node: Node;
  offset: number;
  t: number;
}

/** Turns the page into documents to read: the main content root, the "from here" anchor, extraction and the doc handed to the service worker. */
export class Docs {
  private root: { el: Element; t: number } | null = null;
  private point: Point | null = null;
  private readonly c: Ctx;

  constructor(c: Ctx) {
    this.c = c;
  }

  /** A new page in the same document: the cached content root and "from here" point belong to the old one. */
  reset() {
    this.root = null;
    this.point = null;
  }

  mainRoot(): Element {
    const now = performance.now();
    if (!this.root || !this.root.el.isConnected || now - this.root.t > ROOT_TTL_MS) this.root = { el: findMainRoot(document), t: now };
    return this.root.el;
  }

  /** Remembers where a context menu opened (or the selection start), so "Read from here" starts there. */
  rememberPoint(e: MouseEvent) {
    const r = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY);
    const s = getSelection();
    if (s && !s.isCollapsed && s.rangeCount) this.point = { node: s.getRangeAt(0).startContainer, offset: s.getRangeAt(0).startOffset, t: performance.now() };
    else if (r) this.point = { node: r.startContainer, offset: r.startOffset, t: performance.now() };
  }

  /** "from here" anchor: explicit element, recent context-menu point, selection start, else the first block in view. */
  private anchor(el?: Element): { node: Node; offset: number; precise: boolean } | null {
    if (el) return { node: el, offset: 0, precise: false };
    if (this.point && performance.now() - this.point.t < POINT_TTL_MS) return { node: this.point.node, offset: this.point.offset, precise: true };
    const s = getSelection();
    if (s?.rangeCount && s.anchorNode && !this.c.ui?.hasPopover) return { node: s.anchorNode, offset: s.anchorOffset, precise: true };
    const at = document.elementFromPoint(innerWidth / 2, Math.min(120, innerHeight / 3));
    return at ? { node: at, offset: 0, precise: false } : null;
  }

  private extraction(selection: Range | undefined): Extraction | undefined {
    try {
      const skip = this.c.settings.skip;
      const ex = extract(document, selection ? { skip, selection } : { skip });
      return ex.sentences.length ? ex : undefined;
    } catch {
      return undefined;
    }
  }

  build(mode: ReadMode, el?: Element): ReadDoc | { error: "page-unreadable" } {
    const c = this.c;
    if (c.rule() === "never-read") return { error: "page-unreadable" };
    // With the reader open, reading the page means reading the document the reader shows, so its highlight follows.
    const shown = c.reader && c.readerDoc && mode === "page" ? c.docs.get(c.readerDoc)?.doc : undefined;
    if (shown && shown.source !== "selection") return { ...shown, startIndex: 0 };
    const sel = mode === "selection" ? currentSelection() : undefined;
    const field = mode === "selection" && !sel ? fieldSelection(document.activeElement) : undefined;
    const effective = mode === "selection" && !sel && !field ? "page" : mode;
    const ex = field ? extractFieldText(document, field) : this.extraction(sel);
    if (!ex) return { error: "page-unreadable" };
    let startIndex = 0;
    if (effective === "from-here") {
      const a = this.anchor(el);
      if (a) startIndex = sentenceIndexAt(ex, a);
      this.point = null;
    }
    const doc: ReadDoc = {
      docId: uid(),
      tabId: -1, // the service worker fills tabId from sender.tab.id
      url: location.href,
      title: ex.title,
      sentences: ex.sentences.map((s) => ({ text: s.text, block: s.block })),
      startIndex,
      source: effective,
    };
    c.docs.set(doc.docId, { ex, doc, blocks: [...new Set(doc.sentences.map((s) => s.block))].sort((a, b) => a - b) });
    while (c.docs.size > MAX_DOCS) c.docs.delete(c.docs.keys().next().value!);
    return doc;
  }

  /** Reply to a background 'extract' request. */
  extractReply(mode: ReadMode): ExtractReply {
    const r = this.build(mode);
    return "error" in r ? { error: r.error } : { doc: r };
  }

  play(mode: ReadMode, el?: Element) {
    const r = this.build(mode, el);
    if ("error" in r) {
      this.c.ensureUi().toast("Speak Kit can't read this page", "err");
      return;
    }
    this.c.lastDoc = r;
    this.c.cmd({ cmd: "play", doc: r });
  }
}
