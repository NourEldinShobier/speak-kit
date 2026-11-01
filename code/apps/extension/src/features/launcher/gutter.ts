import { h, iconButton } from "@speakkit/ui/vanilla";
import type { Surface } from "./types";

interface Shown {
  tint: HTMLElement;
  btn: HTMLElement;
  tip: HTMLElement;
  el: Element;
  reading: boolean;
  /** the page element that had keyboard focus when the button appeared; Escape gives focus back to it */
  via?: HTMLElement;
}

const HIDE_DELAY_MS = 160;

/** The paragraph button (B2) with its tint and tooltip. */
export class ParagraphGutter {
  private g: Shown | null = null;
  private timer = 0;
  /** Escape hides the button for this paragraph until the pointer or focus moves to another one */
  private dismissed: Element | null = null;

  constructor(private s: Surface) {}

  get target() {
    return this.g?.el ?? null;
  }

  /** Called on every model change: a paragraph that just started or stopped being read gets the matching button. */
  refresh() {
    const { showGutter } = this.s.model();
    if (!showGutter) this.hide();
    else if (this.g && this.g.reading !== this.isReading(this.g.el)) {
      const { el, via } = this.g;
      this.hide();
      this.show(el, via);
    }
  }

  /** `via`: set when the paragraph was reached by keyboard focus; the button is then moved next to it in tab order. */
  show(el: Element, via?: HTMLElement) {
    clearTimeout(this.timer);
    if (!this.s.model().showGutter || el === this.dismissed) return;
    if (this.g?.el === el) {
      if (via) this.adopt(via);
      this.place();
      return;
    }
    this.hide();
    this.dismissed = null;
    const reading = this.isReading(el);
    const label = reading ? "Reading this paragraph" : "Read from here";
    const tint = h("div", { class: `sk-tint${reading ? " is-reading" : ""}` });
    const btn = iconButton({
      name: reading ? "volume" : "player-play",
      label,
      data: { sk: "gutter-play", state: reading ? "reading" : "idle" },
      round: true,
      className: `lm-btn--primary sk-gbtn${reading ? " is-reading" : ""}`,
      onClick: () => {
        const t = this.g?.el;
        if (reading || !t) return;
        this.hide();
        this.s.hd.readFromHere(t);
      },
    });
    // stays focusable so a screen reader announces the state; it does nothing because this paragraph is already being read
    if (reading) btn.setAttribute("aria-disabled", "true");
    btn.addEventListener("pointerenter", () => {
      clearTimeout(this.timer);
      if (!reading) this.s.hd.warm("hover");
    });
    btn.addEventListener("pointerleave", () => this.scheduleHide());
    btn.addEventListener("focus", () => clearTimeout(this.timer));
    const tip = h("div", { class: "lm-tooltip sk-gtip", "aria-hidden": "true" }, label);
    // first in the shadow root: tabbing from the paragraph reaches this button before the launcher's controls
    this.s.shell.root.prepend(tint, btn, tip);
    this.g = { tint, btn, tip, el, reading };
    if (via) this.adopt(via);
    this.place();
  }

  hide() {
    clearTimeout(this.timer);
    const g = this.g;
    if (!g) return;
    g.tint.remove();
    g.btn.remove();
    g.tip.remove();
    this.g = null;
    this.s.shell.placeHostAfter(null);
  }

  scheduleHide() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.dismissed = null;
      this.hide();
    }, HIDE_DELAY_MS);
  }

  cancelHide() {
    clearTimeout(this.timer);
  }

  /** Escape (WCAG 1.4.13): hides the button without moving the pointer or focus. Returns whether there was one to hide. */
  dismiss(): boolean {
    const g = this.g;
    if (!g) return false;
    const focused = (g.btn.getRootNode() as ShadowRoot).activeElement === g.btn;
    this.dismissed = g.el;
    this.hide();
    if (focused) g.via?.focus({ preventScroll: true });
    return true;
  }

  /** Call on scroll so the overlay follows the paragraph. */
  place() {
    const g = this.g;
    if (!g) return;
    const r = g.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      this.hide();
      return;
    }
    g.tint.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    const x = r.left >= 56 ? r.left - 48 : Math.max(8, r.left - 4);
    const y = Math.max(4, r.top + 2);
    g.btn.style.left = `${x}px`;
    g.btn.style.top = `${y}px`;
    const tipW = g.tip.offsetWidth || 108;
    const tx = x - 20 - tipW;
    g.tip.style.left = `${tx >= 4 ? tx : x}px`;
    g.tip.style.top = `${tx >= 4 ? y + 6 : y + 40}px`;
  }

  private adopt(via: HTMLElement) {
    if (this.g) this.g.via = via;
    this.s.shell.placeHostAfter(via);
  }

  private isReading(el: Element) {
    const m = this.s.model();
    return !!m.readingBlock && (m.status === "preparing" || m.status === "playing" || m.status === "paused") && m.readingBlock === el;
  }
}
