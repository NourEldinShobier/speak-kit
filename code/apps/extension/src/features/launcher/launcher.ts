import type { PlayerStatus, Settings } from "@speakkit/protocol";
import { avatar, button, h, icon, iconButton, logo, menu, menuItem, tooltip } from "@speakkit/ui/vanilla";
import { speedPopover } from "../player";
import { voicePopover } from "../voices";
import { beside } from "../../shared/placement";
import { clock, speedLabel } from "../../shared/format";
import type { Shell, UiHandlers, UiModel } from "../../shared/ui-types";

const ACTIVE: PlayerStatus[] = ["preparing", "playing", "paused"];
const side = (l: Settings["launcher"]) => (l.side === "left" ? " sk-left" : "");

/**
 * The edge launcher (B17 to B21): a thin tab at the page edge that opens into a vertical pill with play, progress, skip,
 * speed, voice and stop; plus the selection bubble (B1), the paragraph gutter button (B2), the toast (B13) and the
 * "Back to current" pill (B14). Lumen kit buttons, tooltip and menu inside the Shadow DOM.
 */
export class Launcher {
  private m: UiModel;
  private bubble: HTMLElement | null = null;
  private gutter: { tint: HTMLElement; btn: HTMLElement; tip: HTMLElement; el: Element; reading: boolean } | null = null;
  private gutterTimer = 0;
  private tab: HTMLElement | null = null;
  private pill: HTMLElement | null = null;
  private ltip: HTMLElement | null = null;
  private key = "";
  private pillOpen = false;
  private closeTimer = 0;
  private openTimer = 0;
  private awayOff?: () => void;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private backEl: HTMLElement | null = null;
  private tabY: number | null = null;
  private dragged = false;
  private railFill: HTMLElement | null = null;
  private pillTime: HTMLElement | null = null;
  private pillSpeed: HTMLElement | null = null;
  private pillVoice: HTMLElement | null = null;
  private ltipPatch: (() => void) | null = null;

  constructor(private shell: Shell, private hd: UiHandlers, model: UiModel, private dockEl: () => HTMLElement | null) {
    this.m = model;
  }

  private get reading() {
    return ACTIVE.includes(this.m.status);
  }
  private frac() {
    return this.m.totalMs > 0 ? Math.min(1, Math.max(0, this.m.elapsedMs / this.m.totalMs)) : 0;
  }

  render(m: UiModel) {
    this.m = m;
    if (!m.showBubble) this.hideBubble();
    if (!m.showGutter) this.showGutter(null);
    else if (this.gutter && this.gutter.reading !== this.isReadingBlock(this.gutter.el)) {
      const el = this.gutter.el;
      this.showGutter(null);
      this.showGutter(el);
    }
    this.renderLauncher();
    this.patch();
  }

  destroy() {
    clearTimeout(this.closeTimer);
    clearTimeout(this.toastTimer);
    clearTimeout(this.gutterTimer);
    clearTimeout(this.openTimer);
    this.awayOff?.();
    for (const e of [this.bubble, this.tab, this.pill, this.ltip, this.toastEl, this.backEl]) e?.remove();
    this.showGutter(null);
  }

  // ------------------------------------------------------------ selection bubble (B1)

  showBubble(r: DOMRect) {
    if (!this.m.showBubble) return;
    if (!this.bubble) {
      const listen = button({ variant: "primary", size: "sm", iconLeft: "player-play", label: "Listen", ariaLabel: "Listen to selection", onClick: () => { this.hideBubble(); this.hd.readSelection(); } });
      listen.dataset.sk = "bubble-listen";
      listen.classList.add("sk-listen");
      listen.addEventListener("pointerenter", () => this.hd.warm("selection"));
      const set = iconButton({ name: "adjustments", label: "Voice and speed", size: 28, data: { sk: "bubble-settings" }, onClick: () => { if (this.bubble) this.shell.togglePopover("speed", set, () => speedPopover({ speed: () => this.m.speed, onSet: (v) => this.hd.setSpeed(v) }), (el, a, sh) => { el.style.left = `${Math.min(Math.max(8, a.right - el.offsetWidth), sh.width - el.offsetWidth - 8)}px`; el.style.top = `${Math.max(8, a.top - el.offsetHeight - 10)}px`; }); } });
      const cp = iconButton({ name: "copy", label: "Copy selection", size: 28, data: { sk: "bubble-copy" }, onClick: () => { this.hd.copySelection(); this.toast("Copied", "ok"); this.hideBubble(); } });
      this.bubble = h("div", { class: "sk-bubble", "data-sk": "bubble" }, tooltip(listen, "Listen to selection", "Ctrl+Shift+S"), set, cp);
      this.bubble.addEventListener("mousedown", (e) => e.preventDefault()); // keep the page selection
      this.shell.root.append(this.bubble);
      // the first sign of intent: have the model ready by the time Listen is pressed
      this.hd.warm("selection");
    }
    const b = this.bubble;
    const bw = b.offsetWidth || 164;
    let top = r.top - 8 - 40;
    if (top < 8) top = Math.min(r.bottom + 8, this.shell.height - 48);
    b.style.top = `${top}px`;
    b.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), this.shell.width - bw - 8)}px`;
  }
  hideBubble() {
    if (this.bubble) {
      this.shell.closePopover("speed");
      this.bubble.remove();
      this.bubble = null;
    }
  }
  get bubbleVisible() {
    return !!this.bubble;
  }

  // ------------------------------------------------------------ paragraph gutter (B2)

  showGutter(el: Element | null) {
    clearTimeout(this.gutterTimer);
    if (!el || !this.m.showGutter) {
      if (this.gutter) {
        this.gutter.tint.remove();
        this.gutter.btn.remove();
        this.gutter.tip.remove();
        this.gutter = null;
      }
      return;
    }
    if (this.gutter?.el === el) {
      this.placeGutter();
      return;
    }
    this.showGutter(null);
    const reading = this.isReadingBlock(el);
    const label = reading ? "Reading this paragraph" : "Read from here";
    const tint = h("div", { class: `sk-tint${reading ? " is-reading" : ""}` });
    const b = iconButton({
      name: reading ? "volume" : "player-play", label, data: { sk: "gutter-play", state: reading ? "reading" : "idle" }, round: true,
      className: `lm-btn--primary sk-gbtn${reading ? " is-reading" : ""}`,
      onClick: () => { const t = this.gutter?.el; if (reading || !t) return; this.showGutter(null); this.hd.readFromHere(t); },
    });
    // stays focusable so a screen reader announces the state; it does nothing because this paragraph is already being read
    if (reading) b.setAttribute("aria-disabled", "true");
    b.addEventListener("pointerenter", () => { clearTimeout(this.gutterTimer); if (!reading) this.hd.warm("hover"); });
    b.addEventListener("pointerleave", () => this.scheduleGutterHide());
    b.addEventListener("focus", () => clearTimeout(this.gutterTimer));
    b.addEventListener("keydown", (e) => { if (e.key === "Escape") { this.showGutter(null); e.stopPropagation(); } });
    const tip = h("div", { class: "lm-tooltip sk-gtip", "aria-hidden": "true" }, label);
    this.shell.root.append(tint, b, tip);
    this.gutter = { tint, btn: b, tip, el, reading };
    this.placeGutter();
  }
  private isReadingBlock(el: Element) {
    return !!this.m.readingBlock && this.reading && this.m.readingBlock === el;
  }
  scheduleGutterHide() {
    clearTimeout(this.gutterTimer);
    this.gutterTimer = window.setTimeout(() => this.showGutter(null), 160);
  }
  cancelGutterHide() {
    clearTimeout(this.gutterTimer);
  }
  get gutterTarget() {
    return this.gutter?.el ?? null;
  }
  /** Call on scroll so the overlay follows the paragraph. */
  placeGutter() {
    const g = this.gutter;
    if (!g) return;
    const r = g.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      this.showGutter(null);
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

  // ------------------------------------------------------------ edge launcher (B17-B21)

  private launcherY(vh: number): number {
    const l = this.m.launcher!;
    const y = this.tabY ?? l.y;
    return Math.min(Math.max(8, y * vh), Math.max(8, vh - 76 - 8));
  }

  /** Re-place the tab and pill after a window resize. */
  reposition() {
    if (this.tab) this.tab.style.top = `${this.launcherY(this.shell.height)}px`;
    if (this.pill) this.pill.style.top = `${this.pillTop(this.pill)}px`;
    this.placeGutter();
  }

  private renderLauncher() {
    const m = this.m;
    const l = m.launcher;
    const reading = this.reading;
    const idleOpen = !!l && l.idle === "open" && !reading;
    const open = !!l && !m.readerOpen && (this.pillOpen || idleOpen);
    const key = l ? `${open}|${reading}|${m.status}|${l.side}|${l.idle}|${l.widerWhileReading}|${l.openOn}|${m.dark}|${m.readerOpen}` : "";
    if (key === this.key) return;
    this.key = key;
    this.tab?.remove();
    this.pill?.remove();
    this.ltip?.remove();
    this.tab = this.pill = this.ltip = null;
    if (!l || m.readerOpen) return;
    if (open) this.buildPill(l, reading);
    else this.buildTab(l, reading);
  }

  private buildTab(l: Settings["launcher"], reading: boolean) {
    const t = h("div", { class: `sk-tab${side(l)}${reading && l.widerWhileReading ? " is-reading" : ""}${!reading && l.idle === "hidden" ? " is-ghost" : ""}`, "data-sk": "launcher-tab", "data-state": this.m.status });
    t.style.top = `${this.launcherY(this.shell.height)}px`;
    if (reading && l.widerWhileReading) {
      const rail = h("div", { class: "sk-rail" }, h("i"));
      this.railFill = rail.firstElementChild as HTMLElement;
      const pb = h("button", { type: "button", class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--xs lm-btn--round sk-tpb", "aria-label": this.m.status === "playing" ? "Pause" : "Resume", "data-sk": "launcher-toggle" },
        icon(this.m.status === "playing" ? "player-pause" : this.m.status === "preparing" ? "loader-2" : "player-play", 11, this.m.status === "preparing" ? "lm-spin" : undefined));
      pb.addEventListener("click", (e) => { e.stopPropagation(); this.hd.toggle(); });
      t.append(rail, pb);
    } else {
      this.railFill = null;
      t.append(icon(l.side === "right" ? "chevron-left" : "chevron-right", 10));
    }
    this.drag(t);
    // hover intent: a short dwell opens the pill (and wakes the model); pressing first (to drag) cancels it
    t.addEventListener("pointerenter", () => {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      this.hd.warm("hover");
      if (l.openOn === "hover") this.openTimer = window.setTimeout(() => this.setPill(true), 90);
    });
    t.addEventListener("pointerleave", () => clearTimeout(this.openTimer));
    t.addEventListener("pointerdown", () => clearTimeout(this.openTimer));
    t.addEventListener("click", () => { if (!this.dragged) this.setPill(true); });
    this.shell.root.append(t);
    this.tab = t;
  }

  /** Drag up/down (tab or pill); the new height is persisted on release. */
  private drag(el: HTMLElement) {
    let start: { y: number; tab: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("button") || e.button !== 0) return;
      start = { y: e.clientY, tab: this.launcherY(this.shell.height) };
      this.dragged = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!start) return;
      if (Math.abs(e.clientY - start.y) > 4) this.dragged = true;
      if (!this.dragged) return;
      const H = this.shell.height;
      const top = Math.min(Math.max(8, start.tab + e.clientY - start.y), H - 76 - 8);
      this.tabY = top / H;
      if (this.tab) this.tab.style.top = `${top}px`;
      if (this.pill) this.pill.style.top = `${this.pillTop(this.pill)}px`;
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (this.dragged && this.tabY !== null) this.hd.moveLauncher(this.tabY);
      setTimeout(() => { this.dragged = false; }, 0);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private pillTop(p: HTMLElement) {
    const H = this.shell.height;
    const tabTop = this.launcherY(H);
    const playOffset = 10 + 28 + 8 + 32 + 8 + 22; // centre of the big button inside the pill
    return Math.min(Math.max(8, tabTop + 38 - playOffset), Math.max(8, H - p.offsetHeight - 8));
  }

  private buildPill(l: Settings["launcher"], reading: boolean) {
    const m = this.m;
    const p = h("div", { class: `sk-pill${side(l)}`, "data-sk": "launcher-pill", "data-state": m.status });
    const sep = () => h("div", { class: "sk-sep" });
    const collapse = iconButton({ name: l.side === "right" ? "chevron-right" : "chevron-left", label: "Collapse", size: 28, data: { sk: "launcher-collapse" }, onClick: () => this.setPill(false, true) });
    const big = h("button", { type: "button", class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--round sk-big", "aria-label": reading ? (m.status === "playing" ? "Pause" : "Resume") : "Listen to this page", "data-sk": "launcher-play" },
      icon(m.status === "preparing" ? "loader-2" : reading && m.status === "playing" ? "player-pause" : "player-play", 18, m.status === "preparing" ? "lm-spin" : undefined));
    big.addEventListener("click", () => (reading ? this.hd.toggle() : this.hd.listen()));
    big.addEventListener("pointerenter", () => { this.hd.warm("hover"); this.showLtip(big, reading); });
    big.addEventListener("pointerleave", () => { this.ltip?.remove(); this.ltip = null; });
    p.append(collapse, logo(32), big);
    if (reading) {
      const rail = h("div", { class: "sk-vrail", "data-sk": "launcher-rail" }, h("i"));
      this.railFill = rail.firstElementChild as HTMLElement;
      rail.addEventListener("click", (e) => { const r = rail.getBoundingClientRect(); this.hd.seekFrac(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))); });
      const time = h("span", { class: "sk-time" });
      this.pillTime = time;
      p.append(rail, time, sep(),
        iconButton({ name: "rewind-backward-10", label: "Back 10 seconds", size: 28, data: { sk: "launcher-back" }, onClick: () => this.hd.skip(-10000) }),
        iconButton({ name: "rewind-forward-10", label: "Forward 10 seconds", size: 28, data: { sk: "launcher-fwd" }, onClick: () => this.hd.skip(10000) }));
    } else {
      this.railFill = null;
      this.pillTime = null;
      p.append(sep(), iconButton({ name: "book", label: "Reader view", size: 32, data: { sk: "launcher-reader" }, onClick: () => { this.setPill(false, true); this.hd.openReader(); } }));
    }
    const sp = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-speed", "aria-label": `Speed ${speedLabel(m.speed)}`, "data-sk": "launcher-speed" }, speedLabel(m.speed));
    sp.addEventListener("click", () => this.shell.togglePopover("speed", sp, () => speedPopover({ speed: () => this.m.speed, onSet: (v) => this.hd.setSpeed(v) }), beside(l.side)));
    const vc = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--icon sk-vc", "aria-label": "Voice", "data-sk": "launcher-voice" });
    const av = avatar(m.voiceName, 24, "accent");
    vc.append(av);
    vc.addEventListener("click", () => this.shell.togglePopover("voice", vc, () => voicePopover({ voices: () => this.hd.voices(), current: () => this.m.voice, onPick: (v) => this.hd.setVoice(v.id), onPreview: (id) => this.hd.previewVoice(id), alive: (el) => el.isConnected }), beside(l.side)));
    this.pillSpeed = sp;
    this.pillVoice = av;
    const last = reading
      ? iconButton({ name: "player-stop", label: "Stop", size: 32, data: { sk: "launcher-stop" }, onClick: () => this.hd.stop() })
      : iconButton({ name: "dots-vertical", label: "More", size: 32, data: { sk: "launcher-more" }, onClick: () => this.shell.togglePopover("menu", last, () => this.menu(), beside(l.side)) });
    p.append(sp, vc, last);
    this.drag(p);
    let entered = false;
    p.addEventListener("pointerenter", () => { entered = true; clearTimeout(this.closeTimer); });
    p.addEventListener("pointerleave", () => this.scheduleClose());
    // A pill rebuilt under a resting pointer (state change after clicking Listen) never gets pointerenter,
    // so moving away would not close it. The first move outside does.
    this.awayOff?.();
    const away = (e: PointerEvent) => {
      if (this.pill !== p || e.composedPath().includes(p)) return;
      this.awayOff?.();
      if (!entered) this.scheduleClose();
    };
    document.addEventListener("pointermove", away, true);
    this.awayOff = () => { document.removeEventListener("pointermove", away, true); this.awayOff = undefined; };
    p.classList.add("is-out");
    this.shell.root.append(p);
    p.style.top = `${this.pillTop(p)}px`;
    requestAnimationFrame(() => p.classList.remove("is-out"));
    this.pill = p;
  }

  private menu(): HTMLElement {
    const m = menu(
      menuItem({ label: "Settings", icon: "adjustments", onSelect: () => { this.shell.closePopover(); this.hd.openOptions(); } }),
      menuItem({ label: "Hide on this site", icon: "eye-off", onSelect: () => { this.shell.closePopover(); this.hd.hideOnSite(); } }),
    );
    m.classList.add("sk-menu");
    m.querySelectorAll<HTMLElement>("button").forEach((b, i) => (b.dataset.sk = ["menu-settings", "menu-hide-site"][i]!));
    return m;
  }

  private patch() {
    const m = this.m;
    if (this.railFill) {
      const horizontal = this.railFill.parentElement?.classList.contains("sk-rail");
      void horizontal;
      this.railFill.style.height = `${this.frac() * 100}%`;
    }
    if (this.pillTime) this.pillTime.textContent = clock(Math.max(0, m.totalMs - m.elapsedMs));
    if (this.pillSpeed) { this.pillSpeed.textContent = speedLabel(m.speed); this.pillSpeed.setAttribute("aria-label", `Speed ${speedLabel(m.speed)}`); }
    if (this.pillVoice) this.pillVoice.textContent = (m.voiceName || "?").slice(0, 1).toUpperCase();
    this.ltipPatch?.();
  }

  private showLtip(anchor: HTMLElement, reading: boolean) {
    this.ltip?.remove();
    const label = h("span");
    const hint = h("kbd", { class: "lm-kbd lm-kbd--sm" });
    const t = h("div", { class: "lm-tooltip sk-ltip", "data-sk": "launcher-tooltip" }, label, hint);
    this.ltipPatch = () => {
      const m = this.m;
      label.textContent = reading ? (m.status === "paused" ? "Resume" : "Pause") : "Listen to this page";
      const hintText = reading ? "Space" : m.estimate() ? clock(m.estimate()) : "";
      hint.textContent = hintText;
      hint.hidden = !hintText;
    };
    this.ltipPatch();
    this.shell.root.append(t);
    const r = anchor.getBoundingClientRect();
    const pr = this.pill!.getBoundingClientRect();
    t.style.top = `${r.top + r.height / 2 - 15}px`;
    if (this.m.launcher?.side === "left") t.style.left = `${pr.right + 8}px`;
    else t.style.right = `${this.shell.width - pr.left + 8}px`;
    this.ltip = t;
  }

  private setPill(open: boolean, force = false) {
    if (open === this.pillOpen && !force) return;
    clearTimeout(this.closeTimer);
    this.pillOpen = open;
    if (!open) this.shell.closePopover();
    this.key = "";
    this.renderLauncher();
    this.patch();
  }
  private scheduleClose() {
    clearTimeout(this.closeTimer);
    const l = this.m.launcher;
    if (!l) return;
    this.closeTimer = window.setTimeout(() => {
      const pop = this.shell.popover;
      if (pop && this.pill?.contains(pop.anchor)) {
        this.scheduleClose();
        return;
      }
      this.setPill(false);
    }, l.closeDelayMs);
  }

  // ------------------------------------------------------------ toast (B13) and back pill (B14)

  toast(message: string, kind: "ok" | "info" | "err" = "ok", action?: { label: string; run: () => void }) {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const t = h(
      "div",
      { class: `lm-toast sk-toast is-${kind}${this.dockEl() ? " is-up" : ""}`, role: kind === "err" ? "alert" : "status", "data-sk": "toast" },
      icon(kind === "err" ? "alert-circle" : kind === "ok" ? "circle-check" : "info-circle", 16),
      h("div", { class: "lm-toast__msg" }, message),
    );
    if (action) {
      const b = button({ size: "sm", label: action.label, onClick: () => { t.remove(); action.run(); } });
      b.dataset.sk = "toast-action";
      t.append(b);
    }
    this.shell.root.append(t);
    this.toastEl = t;
    this.toastTimer = window.setTimeout(() => {
      t.remove();
      if (this.toastEl === t) this.toastEl = null;
    }, action ? 6000 : 3000);
  }

  showBack(show: boolean, below = false) {
    if (!show) {
      this.backEl?.remove();
      this.backEl = null;
      return;
    }
    if (!this.backEl) {
      this.backEl = button({ variant: "secondary", size: "sm", iconLeft: "arrow-up", label: "Back to current", onClick: () => this.hd.backToCurrent() });
      this.backEl.classList.add("sk-back");
      this.backEl.dataset.sk = "back-to-current";
      this.shell.root.append(this.backEl);
    }
    this.backEl.classList.toggle("is-down", below);
  }
}
