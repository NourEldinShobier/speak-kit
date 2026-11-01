import type { PlayerCommand } from "@speakkit/protocol";
import type { Ctx } from "./context";
import { currentSelection, type Docs } from "./docs";

const BLOCK_SEL = "p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,figcaption";
const LAUNCHER_EDGE_PX = 80;
const CHECK_DELAY_MS = 10;
const MIN_PARAGRAPH_CHARS = 20;

/** What a reading shortcut does. */
export type KeyEffect = { cmd: PlayerCommand } | { speed: number } | { closePopover: true };

/** True for page controls and fields where typing must not trigger a reading shortcut. */
export const editable = (t: EventTarget | null) => {
  const e = t as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(e.tagName) || e.getAttribute?.("role") === "button");
};

const step = (speed: number, delta: number) => Math.round((speed + delta) * 20) / 20;
const command = (c: PlayerCommand) => () => ({ cmd: c });

const READING_KEYS = new Map<string, (speed: number, popover: boolean) => KeyEffect>([
  ["ArrowRight", command({ cmd: "next-block" })],
  ["ArrowLeft", command({ cmd: "prev-block" })],
  ["ArrowUp", (speed) => ({ speed: Math.min(3, step(speed, 0.1)) })],
  ["ArrowDown", (speed) => ({ speed: Math.max(0.5, step(speed, -0.1)) })],
  [" ", command({ cmd: "toggle" })],
  ["Escape", (_, popover) => (popover ? { closePopover: true } : { cmd: { cmd: "stop" } })],
]);

/** The effect of `key` while something is being read, or undefined when the key is not a shortcut. */
export const readingKey = (key: string, speed: number, popover: boolean): KeyEffect | undefined => READING_KEYS.get(key)?.(speed, popover);

/** Page events the controller reacts to: pointer, selection, focus, context menu and keyboard. Adds its listeners once, removes them with the signal. */
export class PageInput {
  private readonly c: Ctx;
  private readonly docs: Docs;

  constructor(c: Ctx, docs: Docs) {
    this.c = c;
    this.docs = docs;
  }

  listen(signal: AbortSignal) {
    document.addEventListener("pointerup", this.onPointerUp, { capture: true, signal });
    document.addEventListener("keyup", this.onKeyUp, { capture: true, signal });
    document.addEventListener("selectionchange", this.onSelChange, { signal });
    document.addEventListener("pointermove", this.onMove, { passive: true, signal });
    document.addEventListener("focusin", this.onFocusIn, { signal });
    document.addEventListener("contextmenu", (e) => this.docs.rememberPoint(e), { capture: true, signal });
    document.addEventListener("keydown", this.onKey, { capture: true, signal });
    document.documentElement.addEventListener("pointerleave", () => this.c.ui?.scheduleGutterHide(), { signal });
  }

  private inUi = (e: Event) => !!this.c.ui && e.composedPath().includes(this.c.ui.host);

  private onPointerUp = (e: PointerEvent) => {
    if (!this.inUi(e)) setTimeout(() => this.checkSelection(), CHECK_DELAY_MS);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.shiftKey || e.key === "a") setTimeout(() => this.checkSelection(), CHECK_DELAY_MS);
  };
  private onSelChange = () => {
    if (getSelection()?.isCollapsed) this.c.ui?.hideBubble();
  };

  private checkSelection() {
    const c = this.c;
    if (!c.model().showBubble || c.reader) return;
    const r = currentSelection();
    if (!r) {
      c.ui?.hideBubble();
      return;
    }
    const a = document.activeElement;
    if (a && ((a as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
    if (!/[\p{L}\p{N}]{2}/u.test(r.toString())) return;
    const rects = r.getClientRects();
    const b = r.getBoundingClientRect();
    if (!rects.length) return;
    c.ensureUi().showBubble(new DOMRect(b.left, rects[0]!.top, b.width, b.height));
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    this.warmNearLauncher(e);
    this.pointGutterAt(e.target);
  };

  /** The pointer heading for the launcher tab: start loading the model about a second before the click can happen. */
  private warmNearLauncher(e: PointerEvent) {
    const l = this.c.settings.launcher;
    if (!l.enabled) return;
    const edge = l.side === "right" ? innerWidth - e.clientX : e.clientX;
    if (edge > LAUNCHER_EDGE_PX || Math.abs(e.clientY / innerHeight - l.y) > 0.2) return;
    const rule = this.c.rule();
    if (rule !== "hide-controls" && rule !== "never-read") this.c.warm("hover");
  }

  /** Keyboard users reach the paragraph gutter the same way: focus inside a paragraph (a link in it) shows its button. */
  private onFocusIn = (e: FocusEvent) => this.pointGutterAt(e.target, e.target instanceof HTMLElement ? e.target : undefined);

  /** `via`: the focused element when this comes from keyboard focus; the button is then placed next to it in tab order. */
  private pointGutterAt(target: EventTarget | null, via?: HTMLElement) {
    const c = this.c;
    if (!c.settings.show.gutter || c.reader) return;
    if (!c.ui) {
      if (!c.model().showGutter) return;
      c.ensureUi();
    }
    const u = c.ui!;
    if (target === u.host) {
      u.cancelGutterHide();
      return;
    }
    const el = this.paragraphAt(target);
    if (!el) {
      u.scheduleGutterHide();
      return;
    }
    u.cancelGutterHide();
    if (via || u.gutterTarget !== el) u.showGutter(el, via);
  }

  /** The paragraph the target is in, when it is a readable block of the main content (not a field or button). */
  private paragraphAt(target: EventTarget | null): Element | null {
    const el = (target as Element | null)?.closest?.(BLOCK_SEL);
    if (!el || !this.docs.mainRoot().contains(el)) return null;
    return (el.textContent?.length ?? 0) < MIN_PARAGRAPH_CHARS || editable(el) ? null : el;
  }

  /** Escape closes the reader, then the paragraph button, before it can stop the reading. Returns whether it closed something. */
  private escapeLayer(): boolean {
    const c = this.c;
    if (c.ui?.hasPopover) return false;
    if (c.reader) {
      c.closeReader();
      return true;
    }
    return !!c.ui?.dismissGutter();
  }

  /** Keys that belong to the page (fields), to the kit's own controls (slider, list, menu) or to the Shadow DOM host are not reading shortcuts. */
  private belongsElsewhere(e: KeyboardEvent, t: EventTarget | null): boolean {
    const ui = this.c.ui;
    if (editable(t) && e.key !== "Escape") return true;
    if (t === ui?.host) return true;
    return t instanceof HTMLElement && !!t.closest("[role=slider],[role=listbox],[role=menu]") && !!ui && e.composedPath().includes(ui.host);
  }

  private onKey = (e: KeyboardEvent) => {
    const c = this.c;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const halt = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Escape" && this.escapeLayer()) return halt();
    if (!c.reading || this.belongsElsewhere(e, e.composedPath()[0] ?? e.target)) return;
    const effect = readingKey(e.key, c.state!.speed, !!c.ui?.hasPopover);
    if (!effect) return;
    halt();
    if ("cmd" in effect) c.cmd(effect.cmd);
    else if ("speed" in effect) c.setSpeed(effect.speed);
    else c.ui?.closePop();
  };
}
