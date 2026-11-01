import { Launcher, LAUNCHER_CSS } from "../../features/launcher";
import { Dock, DOCK_CSS } from "../../features/player";
import { READER_CSS, ReaderView, type ReaderDeps } from "../../features/reader";
import type { Extraction } from "../../features/reader";
import type { UiHandlers, UiModel } from "../../shared/ui-types";
import { ShadowShell } from "./shell";
import shellCss from "./shell.css?inline";

/** The in-page UI: one Shadow DOM shell with the launcher (tab, pill, bubble, gutter, toast, back pill) and the dock. */
export class Ui {
  readonly shell: ShadowShell;
  private launcher: Launcher;
  private dock: Dock;

  constructor(hd: UiHandlers, model: UiModel) {
    this.shell = new ShadowShell([shellCss, LAUNCHER_CSS, DOCK_CSS, READER_CSS]);
    this.dock = new Dock(this.shell, hd, model);
    this.launcher = new Launcher(this.shell, hd, model, () => this.dock.el);
    this.shell.setResizeHandler(() => this.launcher.reposition());
    this.render(model);
  }

  get host() {
    return this.shell.host;
  }
  get hasPopover() {
    return !!this.shell.popover;
  }
  get bubbleVisible() {
    return this.launcher.bubbleVisible;
  }
  get gutterTarget() {
    return this.launcher.gutterTarget;
  }

  render(m: UiModel) {
    this.shell.host.dataset.skStatus = m.status;
    this.shell.setTheme(m.dark);
    this.dock.render(m);
    this.launcher.render(m);
  }

  /** Reader view for the extraction being read (the controller keeps ids and sentence indexes aligned with the player). */
  openReader(ex: Extraction, docId: string, deps: Omit<ReaderDeps, "shell">): ReaderView {
    return new ReaderView(ex, docId, { ...deps, shell: this.shell });
  }

  closePop() {
    this.shell.closePopover();
  }

  showBubble(r: DOMRect) {
    this.launcher.showBubble(r);
  }
  hideBubble() {
    this.launcher.hideBubble();
  }
  showGutter(el: Element | null, via?: HTMLElement) {
    this.launcher.showGutter(el, via);
  }
  dismissGutter() {
    return this.launcher.dismissGutter();
  }
  scheduleGutterHide() {
    this.launcher.scheduleGutterHide();
  }
  cancelGutterHide() {
    this.launcher.cancelGutterHide();
  }
  placeGutter() {
    this.launcher.placeGutter();
  }
  toast(message: string, kind: "ok" | "info" | "err" = "ok", action?: { label: string; run: () => void }) {
    this.launcher.toast(message, kind, action);
  }
  showBack(show: boolean, below = false) {
    this.launcher.showBack(show, below);
  }

  destroy() {
    this.dock.destroy();
    this.launcher.destroy();
    this.shell.destroy();
  }
}
