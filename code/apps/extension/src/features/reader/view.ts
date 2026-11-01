import { h, icon, iconButton, popoverSurface, segmented, slider, toggle } from "@speakkit/ui/vanilla";
import type { Extraction } from "./extract";
import type { Shell } from "../../shared/ui-types";
import type { ReaderSettings } from "../settings/types";

export const READER_FONT_STACK: Record<ReaderSettings["font"], string> = {
  sans: 'Inter, "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif',
  dyslexic: '"OpenDyslexic", "Lexend", "Atkinson Hyperlegible", "Comic Sans MS", system-ui, sans-serif',
};

export interface ReaderDeps {
  shell: Shell;
  settings(): ReaderSettings;
  /** persist a change from the reading panel */
  save(patch: Partial<ReaderSettings>): void;
  /** user closed the reader (playback is not touched) */
  onClose(): void;
  /** user clicked a paragraph: read from its first sentence */
  onPlayFrom(sentence: number): void;
  host: string;
}

const HEADING = /^h([1-6])$/;

/**
 * Reader view: the extracted article laid out for reading in the Shadow DOM, with the Lumen reading panel (font, size, width, theme,
 * highlight). It renders the same Extraction that is being read, so sentence indexes line up; highlight marks the current paragraph,
 * sentence and word. Closing it leaves playback alone.
 */
export class ReaderView {
  readonly el: HTMLElement;
  private scroller: HTMLElement;
  private col: HTMLElement;
  private blocks: HTMLElement[] = [];
  private spans: HTMLElement[] = [];
  private cur = -1;
  private words: HTMLElement[] = [];
  private lastWord = -1;
  private lastUserScroll = 0;
  private settingsBtn: HTMLElement;

  constructor(private ex: Extraction, readonly docId: string, private d: ReaderDeps) {
    this.col = h("article", { class: "sk-reader-col" });
    this.buildContent();
    this.scroller = h("main", { class: "sk-reader-scroll" }, this.col);
    this.scroller.addEventListener("wheel", () => { this.lastUserScroll = performance.now(); }, { passive: true });
    this.scroller.addEventListener("touchmove", () => { this.lastUserScroll = performance.now(); }, { passive: true });
    const close = iconButton({ name: "x", label: "Close reader", data: { sk: "reader-close" }, onClick: () => d.onClose() });
    this.settingsBtn = iconButton({ name: "typography", label: "Reading settings", data: { sk: "reader-settings" }, onClick: () => this.togglePanel() });
    this.settingsBtn.setAttribute("aria-haspopup", "dialog");
    const bar = h("header", { class: "sk-reader-bar" }, close, h("div", { class: "sk-reader-src" }, icon("book", 16), h("span", null, d.host || "Reader view")), this.settingsBtn);
    this.el = h("div", { class: "sk-reader", "data-sk": "reader", role: "dialog", "aria-label": "Reader view" }, bar, this.scroller);
    this.apply();
    d.shell.root.append(this.el);
    this.el.addEventListener("keydown", (e) => { if (e.key === "Escape" && !d.shell.popover) { e.stopPropagation(); d.onClose(); } });
    this.scroller.tabIndex = -1;
    this.scroller.focus({ preventScroll: true });
  }

  private buildContent() {
    const { ex } = this;
    const title = ex.title || "";
    if (title) this.col.append(h("h1", { class: "sk-reader-title" }, title));
    this.blocks = [];
    this.spans = new Array(ex.sentences.length);
    let list: HTMLElement | null = null;
    ex.blocks.forEach((b, bi) => {
      const m = HEADING.exec(b.tag);
      const tag = m ? `h${Math.max(2, Number(m[1]))}` : b.tag === "blockquote" ? "blockquote" : "p";
      const dup = !!title && bi === 0 && b.text.trim() === title.trim(); // the page heading is already the reader title
      const el = h(tag as "p", { class: `sk-reader-block${b.tag === "li" ? " is-li" : ""}${dup ? " is-dup" : ""}`, "data-block": bi });
      let pos = 0;
      for (let i = b.first; i < b.first + b.count; i++) {
        const s = ex.sentences[i]!;
        if (s.start > pos) el.append(document.createTextNode(b.text.slice(pos, s.start)));
        const span = h("span", { class: "sk-reader-s", "data-s": i }, s.text);
        this.spans[i] = span;
        el.append(span);
        pos = s.end;
      }
      if (pos < b.text.length) el.append(document.createTextNode(b.text.slice(pos)));
      el.addEventListener("click", () => {
        if (getSelection()?.toString()) return; // selecting text is not a request to read
        this.d.onPlayFrom(b.first);
      });
      if (b.tag === "li") {
        if (!list) {
          list = h("ul", { class: "sk-reader-list" });
          this.col.append(list);
        }
        list.append(h("li", null, el));
      } else {
        list = null;
        this.col.append(el);
      }
      this.blocks.push(el);
    });
  }

  /** Apply font, size, width and theme from the saved reader settings. */
  apply() {
    const r = this.d.settings();
    const el = this.el;
    el.dataset.rtheme = r.theme;
    el.dataset.theme = r.theme === "dark" ? "dark" : "light";
    el.dataset.rhl = r.highlight ? "on" : "off";
    el.style.setProperty("--rd-font", READER_FONT_STACK[r.font]);
    el.style.setProperty("--rd-size", `${r.size}px`);
    el.style.setProperty("--rd-width", `${r.width}px`);
    el.dataset.rfont = r.font;
  }

  // ------------------------------------------------------------ highlight

  /** Mark sentence `i` (and its paragraph); `scroll` follows it unless the user scrolled in the last 3 seconds. */
  highlightSentence(i: number) {
    this.clearWords();
    const prev = this.spans[this.cur];
    prev?.classList.remove("is-sentence");
    prev?.parentElement?.closest(".sk-reader-block")?.classList.remove("is-current");
    this.cur = i;
    const span = this.spans[i];
    if (!span) return;
    span.classList.add("is-sentence");
    const block = span.closest(".sk-reader-block") as HTMLElement | null;
    block?.classList.add("is-current");
    if (block && performance.now() - this.lastUserScroll > 3000) block.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** Mark word `index` of the current sentence (index into the sentence's \S+ tokens). */
  highlightWord(index: number) {
    const span = this.spans[this.cur];
    if (!span || this.d.settings().highlight === false) return;
    if (!this.words.length) this.splitWords(span, this.ex.sentences[this.cur]!.text);
    this.words[this.lastWord]?.classList.remove("is-word");
    this.lastWord = index;
    this.words[index]?.classList.add("is-word");
  }

  private splitWords(span: HTMLElement, text: string) {
    span.textContent = "";
    this.words = [];
    let pos = 0;
    for (const m of text.matchAll(/\S+/g)) {
      if (m.index! > pos) span.append(document.createTextNode(text.slice(pos, m.index)));
      const w = h("span", { class: "sk-reader-w" }, m[0]);
      this.words.push(w);
      span.append(w);
      pos = m.index! + m[0].length;
    }
    if (pos < text.length) span.append(document.createTextNode(text.slice(pos)));
  }

  private clearWords() {
    if (!this.words.length) return;
    const span = this.spans[this.cur];
    if (span) span.textContent = this.ex.sentences[this.cur]?.text ?? "";
    this.words = [];
    this.lastWord = -1;
  }

  /** Playback stopped: nothing is current any more. */
  clearHighlight() {
    this.highlightSentence(-1);
    this.blocks.forEach((b) => b.classList.remove("is-current"));
  }

  // ------------------------------------------------------------ reading panel

  private togglePanel() {
    this.d.shell.togglePopover("reading", this.settingsBtn, () => this.panel(), (el, a, sh) => {
      el.style.top = `${a.bottom + 8}px`;
      el.style.left = `${Math.max(8, Math.min(a.right - el.offsetWidth, sh.width - el.offsetWidth - 8))}px`;
    });
  }

  private panel(): HTMLElement {
    const r = this.d.settings();
    const row = (label: string, control: Node, value?: HTMLElement) => h("div", { class: "sk-prow" }, h("span", { class: "sk-plabel" }, label), h("div", { class: "sk-pctl" }, control, value));
    const sizeVal = h("output", { class: "sk-pval" }, `${r.size}px`);
    const widthVal = h("output", { class: "sk-pval" }, `${r.width}px`);
    const font = segmented({ label: "Font", value: r.font, items: [{ id: "sans", label: "Sans" }, { id: "serif", label: "Serif" }, { id: "dyslexic", label: "Dyslexic" }], onChange: (id) => this.change({ font: id as ReaderSettings["font"] }) });
    const size = slider({ min: 14, max: 28, step: 1, value: r.size, label: "Text size", onInput: (v) => { sizeVal.textContent = `${v}px`; this.preview({ size: v }); }, onCommit: (v) => this.change({ size: v }) });
    const width = slider({ min: 480, max: 960, step: 20, value: r.width, label: "Page width", onInput: (v) => { widthVal.textContent = `${v}px`; this.preview({ width: v }); }, onCommit: (v) => this.change({ width: v }) });
    const theme = segmented({ label: "Theme", value: r.theme, items: [{ id: "paper", label: "Paper" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }], onChange: (id) => this.change({ theme: id as ReaderSettings["theme"] }) });
    const hl = toggle({ checked: r.highlight, label: "Highlight sentence", onChange: (on) => this.change({ highlight: on }) });
    const pop = popoverSurface("Reading", font.el, row("Size", size.el, sizeVal), row("Width", width.el, widthVal), theme.el, row("Highlight sentence", hl));
    pop.classList.add("sk-pop-reading");
    return pop;
  }

  private preview(patch: Partial<ReaderSettings>) {
    const r = { ...this.d.settings(), ...patch };
    if (patch.size) this.el.style.setProperty("--rd-size", `${r.size}px`);
    if (patch.width) this.el.style.setProperty("--rd-width", `${r.width}px`);
  }

  private change(patch: Partial<ReaderSettings>) {
    this.d.save(patch);
    this.apply();
    this.preview(patch);
  }

  close() {
    this.d.shell.closePopover("reading");
    this.el.remove();
  }
}
