import kitCss from "virtual:lumen-content-css";
import { h } from "@speakkit/ui/vanilla";
import type { Placement, Shell } from "../../shared/ui-types";

declare const __TEST__: boolean | undefined;
const OPEN_SHADOW = typeof __TEST__ !== "undefined" && !!__TEST__;

/**
 * The closed Shadow DOM host for the in-page UI. Styles are the Lumen kit subset plus each feature's composition CSS; the
 * container carries `lm` (kit tokens and base) and `sk`. One popover at a time; outside click and Escape close it.
 */
export class ShadowShell implements Shell {
  readonly host: HTMLElement;
  readonly root: HTMLElement;
  popover: Shell["popover"] = null;
  private resizeCb?: () => void;

  constructor(featureCss: string[]) {
    this.host = document.createElement("speakkit-ui");
    this.host.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block");
    const shadow = this.host.attachShadow({ mode: OPEN_SHADOW ? "open" : "closed" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync([kitCss, ...featureCss].join("\n"));
    shadow.adoptedStyleSheets = [sheet];
    this.root = h("div", { class: "lm sk", "data-theme": "light" });
    shadow.append(this.root);
    document.documentElement.append(this.host);
    document.addEventListener("pointerdown", this.onDown, true);
    document.addEventListener("keydown", this.onKey, true);
    addEventListener("resize", this.onResize);
  }

  get width() {
    return this.host.clientWidth;
  }
  get height() {
    return this.host.clientHeight;
  }

  setTheme(dark: boolean) {
    this.root.dataset.theme = dark ? "dark" : "light";
  }
  /** called on window resize after open popovers are closed */
  setResizeHandler(cb: () => void) {
    this.resizeCb = cb;
  }

  togglePopover(kind: string, anchor: HTMLElement, build: () => HTMLElement, place: Placement) {
    if (this.popover?.kind === kind && this.popover.anchor === anchor) {
      this.closePopover();
      return;
    }
    this.closePopover();
    const el = build();
    el.dataset.sk = `popover-${kind}`;
    this.root.append(el);
    anchor.classList.add("is-open");
    this.popover = { kind, el, anchor };
    place(el, anchor.getBoundingClientRect(), this);
    (el.querySelector("input") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  closePopover(kind?: string) {
    const p = this.popover;
    if (!p || (kind && p.kind !== kind)) return;
    p.el.remove();
    p.anchor.classList.remove("is-open");
    this.popover = null;
  }

  destroy() {
    document.removeEventListener("pointerdown", this.onDown, true);
    document.removeEventListener("keydown", this.onKey, true);
    removeEventListener("resize", this.onResize);
    this.host.remove();
  }

  private onDown = (e: Event) => {
    const p = this.popover;
    if (!p) return;
    const path = e.composedPath();
    if (path.includes(p.el) || path.includes(p.anchor)) return;
    this.closePopover();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.popover) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.closePopover();
    }
  };
  private onResize = () => {
    this.closePopover();
    this.resizeCb?.();
  };
}
