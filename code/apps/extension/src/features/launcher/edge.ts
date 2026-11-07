import type { Settings } from "@speakkit/protocol";
import { h, icon, iconButton, logo } from "@speakkit/ui/vanilla";
import { clock, speedLabel } from "../../shared/format";
import { beside } from "../../shared/placement";
import { closeButton, focusedControl, moreMenu, readerButton, restoreFocus, speedVoiceButtons } from "./edge-parts";
import { ACTIVE, MARGIN, PLAY_VIEW, TAB_HEIGHT, pillTop, railTop, sideClass, tabClass, tabTop, tooltipText } from "./edge-model";
import type { Surface } from "./types";

type Launcher = Settings["launcher"];

/** The edge launcher (B17 to B21): a thin tab at the page edge that opens into a vertical pill with play, progress, skip, speed, voice and stop. While reading, the tab is a slim progress rail centred on the viewport height. */
export class EdgeLauncher {
  private tab: HTMLElement | null = null;
  private pill: HTMLElement | null = null;
  private ltip: HTMLElement | null = null;
  private ltipPatch: (() => void) | null = null;
  private key = "";
  private pillOpen = false;
  private closeTimer = 0;
  private openTimer = 0;
  private awayOff: (() => void) | undefined;
  private tabY: number | null = null;
  private dragged = false;
  private railFill: HTMLElement | null = null;
  private pillTime: HTMLElement | null = null;
  private pillSpeed: HTMLElement | null = null;
  private pillVoice: HTMLElement | null = null;
  private readonly s: Surface;
  private readonly tip = { show: (a: HTMLElement, label: string) => this.showLtip(a, () => ({ label, hint: "" })), hide: () => this.hideLtip() };

  constructor(s: Surface) {
    this.s = s;
  }

  private get m() {
    return this.s.model();
  }
  private get reading() {
    return ACTIVE.includes(this.m.status);
  }

  /** Rebuilds the tab or pill when something that changes its shape did, then updates the live values. */
  render() {
    const focused = focusedControl(this.s.shell.root, this.tab, this.pill);
    this.renderLauncher();
    restoreFocus(this.s.shell.root, focused, this.pill ? "launcher-play" : "launcher-tab");
    this.patch();
  }

  destroy() {
    clearTimeout(this.closeTimer);
    clearTimeout(this.openTimer);
    this.awayOff?.();
    for (const e of [this.tab, this.pill, this.ltip]) e?.remove();
  }

  /** Re-place the tab and pill after a window resize. */
  reposition() {
    if (this.tab) this.tab.style.top = `${this.tabTop()}px`;
    if (this.pill) this.pill.style.top = `${this.pillTop(this.pill)}px`;
  }

  /** Reading with the widened tab on: the tab is the progress rail, which stays centred and is not dragged. */
  private get rail() {
    return this.reading && !!this.m.launcher?.widerWhileReading;
  }

  private tabTop(): number {
    if (this.rail) return railTop(this.s.shell.height);
    return tabTop(this.tabY ?? this.m.launcher!.y, this.s.shell.height);
  }

  private pillTop(p: HTMLElement): number {
    return pillTop(this.s.shell.height, p.offsetHeight);
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
    this.tab = this.pill = this.ltip = this.railFill = this.pillTime = null;
    if (!l) this.pillOpen = false; // closed for this tab: it comes back as the quiet tab
    if (!l || m.readerOpen) return;
    if (open) this.buildPill(l, reading);
    else this.buildTab(l, reading);
  }

  // ------------------------------------------------------------ tab

  private buildTab(l: Launcher, reading: boolean) {
    const rail = reading && l.widerWhileReading;
    const t = h("div", {
      class: tabClass(l, reading),
      "data-sk": "launcher-tab",
      "data-state": this.m.status,
      role: "button",
      tabindex: 0,
      "aria-label": reading ? "Open reading controls" : "Open Speak Kit controls",
    });
    t.style.top = `${this.tabTop()}px`;
    if (rail) t.append(this.tabRail());
    else t.append(icon(l.side === "right" ? "chevron-left" : "chevron-right", 10));
    if (!rail) this.drag(t);
    this.openOnIntent(t, l);
    this.s.shell.root.append(t);
    this.tab = t;
  }

  /** The collapsed reading state: a thin track with a dark fill that shows how far the reading has got. */
  private tabRail(): HTMLElement {
    const rail = h("div", { class: "sk-rail" }, h("i"));
    this.railFill = rail.firstElementChild as HTMLElement;
    return rail;
  }

  /** Hover intent: a short dwell opens the pill (and wakes the model); pressing first (to drag) cancels it. */
  private openOnIntent(t: HTMLElement, l: Launcher) {
    t.addEventListener("pointerenter", () => {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      this.s.hd.warm("hover");
      if (l.openOn === "hover") this.openTimer = window.setTimeout(() => this.setPill(true), 90);
    });
    t.addEventListener("pointerleave", () => clearTimeout(this.openTimer));
    t.addEventListener("pointerdown", () => clearTimeout(this.openTimer));
    t.addEventListener("click", () => {
      if (!this.dragged) this.setPill(true);
    });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      this.setPill(true);
      this.pill?.querySelector<HTMLElement>("[data-sk=launcher-play]")?.focus({ preventScroll: true });
    });
  }

  /** Drag the tab up/down; the new height is persisted on release. */
  private drag(el: HTMLElement) {
    let start: { y: number; tab: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("button") || e.button !== 0 || this.rail) return;
      start = { y: e.clientY, tab: this.tabTop() };
      this.dragged = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!start) return;
      if (Math.abs(e.clientY - start.y) > 4) this.dragged = true;
      if (!this.dragged) return;
      const H = this.s.shell.height;
      const top = Math.min(Math.max(MARGIN, start.tab + e.clientY - start.y), H - TAB_HEIGHT - MARGIN);
      this.tabY = top / H;
      this.reposition();
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (this.dragged && this.tabY !== null) this.s.hd.moveLauncher(this.tabY);
      setTimeout(() => {
        this.dragged = false;
      }, 0);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ------------------------------------------------------------ pill

  private buildPill(l: Launcher, reading: boolean) {
    const p = h("div", { class: `sk-pill${sideClass(l)}`, "data-sk": "launcher-pill", "data-state": this.m.status });
    const collapse = iconButton({
      name: l.side === "right" ? "chevron-right" : "chevron-left",
      label: "Collapse",
      size: 28,
      data: { sk: "launcher-collapse" },
      onClick: () => this.setPill(false, true),
    });
    p.append(collapse, logo(32), this.pillPlay(reading), ...(reading ? this.pillProgress() : this.pillReader()));
    const { speed, voice, avatar } = speedVoiceButtons(this.s, l);
    this.pillSpeed = speed;
    this.pillVoice = avatar;
    p.append(speed, voice, this.pillLast(l, reading), closeButton(this.s.hd, this.tip));
    this.closeWhenAway(p);
    p.classList.add("is-out");
    this.s.shell.root.append(p);
    p.style.top = `${this.pillTop(p)}px`;
    requestAnimationFrame(() => p.classList.remove("is-out"));
    this.pill = p;
  }

  private pillPlay(reading: boolean): HTMLElement {
    const { hd } = this.s;
    const view = PLAY_VIEW[this.m.status];
    const big = h(
      "button",
      { type: "button", class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--round sk-big", "aria-label": view.label, "data-sk": "launcher-play" },
      icon(view.icon, 18, view.icon === "loader-2" ? "lm-spin" : undefined),
    );
    big.addEventListener("click", () => (reading ? hd.toggle() : hd.listen()));
    big.addEventListener("pointerenter", () => {
      hd.warm("hover");
      this.showLtip(big, () => tooltipText(this.m, reading));
    });
    big.addEventListener("pointerleave", () => this.hideLtip());
    return big;
  }

  private sep = () => h("div", { class: "sk-sep" });

  /** Reading: a seekable rail, the time left and the 10 second skips. */
  private pillProgress(): HTMLElement[] {
    const { hd } = this.s;
    const rail = h("div", { class: "sk-vrail", "data-sk": "launcher-rail" }, h("i"));
    this.railFill = rail.firstElementChild as HTMLElement;
    rail.addEventListener("click", (e) => {
      const r = rail.getBoundingClientRect();
      hd.seekFrac(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    });
    this.pillTime = h("span", { class: "sk-time" });
    return [
      rail,
      this.pillTime,
      this.sep(),
      iconButton({ name: "rewind-backward-10", label: "Back 10 seconds", size: 28, data: { sk: "launcher-back" }, onClick: () => hd.skip(-10000) }),
      iconButton({ name: "rewind-forward-10", label: "Forward 10 seconds", size: 28, data: { sk: "launcher-fwd" }, onClick: () => hd.skip(10000) }),
    ];
  }

  /** Idle: the reader view button. */
  private pillReader(): HTMLElement[] {
    return [this.sep(), readerButton(this.s.hd, () => this.setPill(false, true))];
  }

  /** The last button: stop while reading, else the "More" menu. */
  private pillLast(l: Launcher, reading: boolean): HTMLElement {
    const { shell, hd } = this.s;
    if (reading) return iconButton({ name: "player-stop", label: "Stop", size: 32, data: { sk: "launcher-stop" }, onClick: () => hd.stop() });
    const more: HTMLElement = iconButton({
      name: "dots-vertical",
      label: "More",
      size: 32,
      data: { sk: "launcher-more" },
      onClick: () => shell.togglePopover({ kind: "menu", anchor: more, build: () => moreMenu(shell, hd), place: beside(l.side) }),
    });
    return more;
  }

  /** The pill closes shortly after the pointer leaves it. */
  private closeWhenAway(p: HTMLElement) {
    let entered = false;
    p.addEventListener("pointerenter", () => {
      entered = true;
      clearTimeout(this.closeTimer);
    });
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
    this.awayOff = () => {
      document.removeEventListener("pointermove", away, true);
      this.awayOff = undefined;
    };
  }

  private patch() {
    const m = this.m;
    if (this.railFill) this.railFill.style.height = `${(m.totalMs > 0 ? Math.min(1, Math.max(0, m.elapsedMs / m.totalMs)) : 0) * 100}%`;
    if (this.pillTime) this.pillTime.textContent = clock(Math.max(0, m.totalMs - m.elapsedMs));
    if (this.pillSpeed) {
      this.pillSpeed.textContent = speedLabel(m.speed);
      this.pillSpeed.setAttribute("aria-label", `Speed ${speedLabel(m.speed)}`);
    }
    if (this.pillVoice) this.pillVoice.textContent = (m.voiceName || "?").slice(0, 1).toUpperCase();
    if (this.pill) this.pill.style.top = `${this.pillTop(this.pill)}px`; // the time text changes the height
    this.ltipPatch?.();
  }

  private hideLtip() {
    this.ltip?.remove();
    this.ltip = null;
  }

  private showLtip(anchor: HTMLElement, text: () => { label: string; hint: string }) {
    this.ltip?.remove();
    const label = h("span");
    const hint = h("kbd", { class: "lm-kbd lm-kbd--sm" });
    const t = h("div", { class: "lm-tooltip sk-ltip", "data-sk": "launcher-tooltip" }, label, hint);
    this.ltipPatch = () => {
      const t = text();
      label.textContent = t.label;
      hint.textContent = t.hint;
      hint.style.display = t.hint ? "" : "none"; // the kit sets display on .lm-kbd, which overrides the hidden attribute
    };
    this.ltipPatch();
    this.s.shell.root.append(t);
    const r = anchor.getBoundingClientRect();
    const pr = this.pill!.getBoundingClientRect();
    t.style.top = `${r.top + r.height / 2 - 15}px`;
    if (this.m.launcher?.side === "left") t.style.left = `${pr.right + 8}px`;
    else t.style.right = `${this.s.shell.width - pr.left + 8}px`;
    this.ltip = t;
  }

  private setPill(open: boolean, force = false) {
    if (open === this.pillOpen && !force) return;
    clearTimeout(this.closeTimer);
    this.pillOpen = open;
    if (!open) this.s.shell.closePopover();
    this.key = "";
    this.render();
  }

  private scheduleClose() {
    clearTimeout(this.closeTimer);
    const l = this.m.launcher;
    if (!l) return;
    this.closeTimer = window.setTimeout(() => {
      const pop = this.s.shell.popover;
      if (pop && this.pill?.contains(pop.anchor)) {
        this.scheduleClose();
        return;
      }
      this.setPill(false);
    }, l.closeDelayMs);
  }
}
