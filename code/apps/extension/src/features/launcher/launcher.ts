import type { Shell, UiHandlers, UiModel } from "../../shared/ui-types";
import { SelectionBubble } from "./bubble";
import { EdgeLauncher } from "./edge";
import { ParagraphGutter } from "./gutter";
import { Notices } from "./notices";

/** What the launcher is built from: the shadow shell, the controller's handlers, the first model, and the dock element (toasts sit above it). */
export interface LauncherDeps {
  shell: Shell;
  hd: UiHandlers;
  model: UiModel;
  dockEl: () => HTMLElement | null;
}

/**
 * The in-page launcher surfaces: the edge tab and pill (B17 to B21), the selection bubble (B1), the paragraph button (B2),
 * the toast (B13) and the "Back to current" pill (B14). Lumen kit buttons, tooltip and menu inside the Shadow DOM.
 */
export class Launcher {
  private m: UiModel;
  private edge: EdgeLauncher;
  private bubble: SelectionBubble;
  private gutter: ParagraphGutter;
  private notices: Notices;

  constructor({ shell, hd, model, dockEl }: LauncherDeps) {
    this.m = model;
    const surface = { shell, hd, model: () => this.m };
    this.edge = new EdgeLauncher(surface);
    this.notices = new Notices(surface, dockEl);
    this.bubble = new SelectionBubble(surface, () => this.notices.toast("Copied", "ok"));
    this.gutter = new ParagraphGutter(surface);
  }

  render(m: UiModel) {
    this.m = m;
    if (!m.showBubble) this.bubble.hide();
    this.gutter.refresh();
    this.edge.render();
  }

  destroy() {
    this.edge.destroy();
    this.bubble.hide();
    this.gutter.hide();
    this.notices.destroy();
  }

  reposition() {
    this.edge.reposition();
    this.gutter.place();
  }

  showBubble(r: DOMRect) {
    this.bubble.show(r);
  }
  hideBubble() {
    this.bubble.hide();
  }
  get bubbleVisible() {
    return this.bubble.visible;
  }

  /** `null` hides the paragraph button. `via`: the focused page element when the paragraph was reached by keyboard. */
  showGutter(el: Element | null, via?: HTMLElement) {
    if (el && this.m.showGutter) this.gutter.show(el, via);
    else this.gutter.hide();
  }
  scheduleGutterHide() {
    this.gutter.scheduleHide();
  }
  cancelGutterHide() {
    this.gutter.cancelHide();
  }
  placeGutter() {
    this.gutter.place();
  }
  dismissGutter() {
    return this.gutter.dismiss();
  }
  get gutterTarget() {
    return this.gutter.target;
  }

  toast(message: string, kind: "ok" | "info" | "err" = "ok", action?: { label: string; run: () => void }) {
    this.notices.toast(message, kind, action);
  }
  showBack(show: boolean, below = false) {
    this.notices.showBack(show, below);
  }
}
