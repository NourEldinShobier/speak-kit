import { button, h, iconButton, tooltip } from "@speakkit/ui/vanilla";
import { speedPopover } from "../player";
import type { Surface } from "./types";

/** The selection bubble: Listen, voice and speed, copy. */
export class SelectionBubble {
  private el: HTMLElement | null = null;
  private readonly s: Surface;
  private readonly onCopied: () => void;

  constructor(s: Surface, onCopied: () => void) {
    this.s = s;
    this.onCopied = onCopied;
  }

  get visible() {
    return !!this.el;
  }

  show(r: DOMRect) {
    if (!this.s.model().showBubble) return;
    if (!this.el) this.build();
    this.place(this.el!, r);
  }

  private build() {
    const { shell, hd } = this.s;
    const listen = button({
      variant: "primary",
      size: "sm",
      iconLeft: "player-play",
      label: "Listen",
      ariaLabel: "Listen to selection",
      onClick: () => {
        this.hide();
        hd.readSelection();
      },
    });
    listen.dataset.sk = "bubble-listen";
    listen.classList.add("sk-listen");
    listen.addEventListener("pointerenter", () => hd.warm("selection"));
    const set = iconButton({
      name: "adjustments",
      label: "Voice and speed",
      size: 32,
      data: { sk: "bubble-settings" },
      onClick: () => {
        if (!this.el) return;
        shell.togglePopover({
          kind: "speed",
          anchor: set,
          build: () => speedPopover({ speed: () => this.s.model().speed, onSet: (v) => hd.setSpeed(v) }),
          place: (el, a, sh) => {
            el.style.left = `${Math.min(Math.max(8, a.right - el.offsetWidth), sh.width - el.offsetWidth - 8)}px`;
            el.style.top = `${Math.max(8, a.top - el.offsetHeight - 10)}px`;
          },
        });
      },
    });
    const copy = iconButton({
      name: "copy",
      label: "Copy selection",
      size: 32,
      data: { sk: "bubble-copy" },
      onClick: () => {
        hd.copySelection();
        this.onCopied();
        this.hide();
      },
    });
    this.el = h("div", { class: "sk-bubble", "data-sk": "bubble" }, tooltip(listen, "Listen to selection", "Ctrl+Shift+S"), set, copy);
    this.el.addEventListener("mousedown", (e) => e.preventDefault()); // keep the page selection
    shell.root.append(this.el);
    // the first sign of intent: have the model ready by the time Listen is pressed
    hd.warm("selection");
  }

  private place(b: HTMLElement, r: DOMRect) {
    const { shell } = this.s;
    const bw = b.offsetWidth || 172;
    let top = r.top - 8 - 44;
    if (top < 8) top = Math.min(r.bottom + 8, shell.height - 52);
    b.style.top = `${top}px`;
    b.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), shell.width - bw - 8)}px`;
  }

  hide() {
    if (!this.el) return;
    this.s.shell.closePopover("speed");
    this.el.remove();
    this.el = null;
  }
}
