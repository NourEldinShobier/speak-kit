import { button, h, icon } from "@speakkit/ui/vanilla";
import type { Surface } from "./types";

const TOAST_ICON = { err: "alert-circle", ok: "circle-check", info: "info-circle" } as const;

/** The toast (B13) and the "Back to current" pill (B14). */
export class Notices {
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private backEl: HTMLElement | null = null;
  private readonly s: Surface;
  private readonly dockEl: () => HTMLElement | null;

  constructor(s: Surface, dockEl: () => HTMLElement | null) {
    this.s = s;
    this.dockEl = dockEl;
  }

  toast(message: string, kind: "ok" | "info" | "err" = "ok", action?: { label: string; run: () => void }) {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const t = h(
      "div",
      { class: `lm-toast sk-toast is-${kind}${this.dockEl() ? " is-up" : ""}`, role: kind === "err" ? "alert" : "status", "data-sk": "toast" },
      icon(TOAST_ICON[kind], 16),
      h("div", { class: "lm-toast__msg" }, message),
    );
    if (action) {
      const b = button({
        size: "sm",
        label: action.label,
        onClick: () => {
          t.remove();
          action.run();
        },
      });
      b.dataset.sk = "toast-action";
      t.append(b);
    }
    this.s.shell.root.append(t);
    this.toastEl = t;
    this.toastTimer = window.setTimeout(
      () => {
        t.remove();
        if (this.toastEl === t) this.toastEl = null;
      },
      action ? 6000 : 3000,
    );
  }

  showBack(show: boolean, below = false) {
    if (!show) {
      this.backEl?.remove();
      this.backEl = null;
      return;
    }
    if (!this.backEl) {
      this.backEl = button({ variant: "secondary", size: "sm", iconLeft: "arrow-up", label: "Back to current", onClick: () => this.s.hd.backToCurrent() });
      this.backEl.classList.add("sk-back");
      this.backEl.dataset.sk = "back-to-current";
      this.s.shell.root.append(this.backEl);
    }
    this.backEl.classList.toggle("is-down", below);
  }

  destroy() {
    clearTimeout(this.toastTimer);
    this.toastEl?.remove();
    this.backEl?.remove();
  }
}
