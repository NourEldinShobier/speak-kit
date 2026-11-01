import type { PlayerStatus, Settings } from "@speakkit/protocol";
import { avatar, h, icon, iconButton, logo, menu, menuItem } from "@speakkit/ui/vanilla";
import { clock, speedLabel } from "../../shared/format";
import { beside } from "../../shared/placement";
import { speedPopover } from "../player";
import { voicePopover } from "../voices";
import type { Surface } from "./types";

const ACTIVE: PlayerStatus[] = ["preparing", "playing", "paused"];
const side = (l: Settings["launcher"]) => (l.side === "left" ? " sk-left" : "");
const TAB_HEIGHT = 76;
const MARGIN = 8;

/** The edge launcher (B17 to B21): a thin tab at the page edge that opens into a vertical pill with play, progress, skip, speed, voice and stop. */
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
    this.renderLauncher();
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
    if (this.tab) this.tab.style.top = `${this.tabTop(this.s.shell.height)}px`;
    if (this.pill) this.pill.style.top = `${this.pillTop(this.pill)}px`;
  }

  private tabTop(vh: number): number {
    const y = this.tabY ?? this.m.launcher!.y;
    return Math.min(Math.max(MARGIN, y * vh), Math.max(MARGIN, vh - TAB_HEIGHT - MARGIN));
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
    const { shell, hd } = this.s;
    const t = h("div", {
      class: `sk-tab${side(l)}${reading && l.widerWhileReading ? " is-reading" : ""}${!reading && l.idle === "hidden" ? " is-ghost" : ""}`,
      "data-sk": "launcher-tab",
      "data-state": this.m.status,
    });
    t.style.top = `${this.tabTop(shell.height)}px`;
    if (reading && l.widerWhileReading) {
      const rail = h("div", { class: "sk-rail" }, h("i"));
      this.railFill = rail.firstElementChild as HTMLElement;
      const pb = h(
        "button",
        { type: "button", class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--xs lm-btn--round sk-tpb", "aria-label": this.m.status === "playing" ? "Pause" : "Resume", "data-sk": "launcher-toggle" },
        icon(this.m.status === "playing" ? "player-pause" : this.m.status === "preparing" ? "loader-2" : "player-play", 11, this.m.status === "preparing" ? "lm-spin" : undefined),
      );
      pb.addEventListener("click", (e) => {
        e.stopPropagation();
        hd.toggle();
      });
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
      hd.warm("hover");
      if (l.openOn === "hover") this.openTimer = window.setTimeout(() => this.setPill(true), 90);
    });
    t.addEventListener("pointerleave", () => clearTimeout(this.openTimer));
    t.addEventListener("pointerdown", () => clearTimeout(this.openTimer));
    t.addEventListener("click", () => {
      if (!this.dragged) this.setPill(true);
    });
    shell.root.append(t);
    this.tab = t;
  }

  /** Drag up/down (tab or pill); the new height is persisted on release. */
  private drag(el: HTMLElement) {
    let start: { y: number; tab: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("button") || e.button !== 0) return;
      start = { y: e.clientY, tab: this.tabTop(this.s.shell.height) };
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

  private pillTop(p: HTMLElement) {
    const H = this.s.shell.height;
    const playOffset = 10 + 28 + 8 + 32 + 8 + 22; // centre of the big button inside the pill
    return Math.min(Math.max(MARGIN, this.tabTop(H) + 38 - playOffset), Math.max(MARGIN, H - p.offsetHeight - MARGIN));
  }

  private buildPill(l: Settings["launcher"], reading: boolean) {
    const { shell, hd } = this.s;
    const m = this.m;
    const p = h("div", { class: `sk-pill${side(l)}`, "data-sk": "launcher-pill", "data-state": m.status });
    const sep = () => h("div", { class: "sk-sep" });
    const collapse = iconButton({
      name: l.side === "right" ? "chevron-right" : "chevron-left",
      label: "Collapse",
      size: 28,
      data: { sk: "launcher-collapse" },
      onClick: () => this.setPill(false, true),
    });
    const big = h(
      "button",
      {
        type: "button",
        class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--round sk-big",
        "aria-label": reading ? (m.status === "playing" ? "Pause" : "Resume") : "Listen to this page",
        "data-sk": "launcher-play",
      },
      icon(m.status === "preparing" ? "loader-2" : reading && m.status === "playing" ? "player-pause" : "player-play", 18, m.status === "preparing" ? "lm-spin" : undefined),
    );
    big.addEventListener("click", () => (reading ? hd.toggle() : hd.listen()));
    big.addEventListener("pointerenter", () => {
      hd.warm("hover");
      this.showLtip(big, reading);
    });
    big.addEventListener("pointerleave", () => {
      this.ltip?.remove();
      this.ltip = null;
    });
    p.append(collapse, logo(32), big);
    if (reading) {
      const rail = h("div", { class: "sk-vrail", "data-sk": "launcher-rail" }, h("i"));
      this.railFill = rail.firstElementChild as HTMLElement;
      rail.addEventListener("click", (e) => {
        const r = rail.getBoundingClientRect();
        hd.seekFrac(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      });
      const time = h("span", { class: "sk-time" });
      this.pillTime = time;
      p.append(
        rail,
        time,
        sep(),
        iconButton({ name: "rewind-backward-10", label: "Back 10 seconds", size: 28, data: { sk: "launcher-back" }, onClick: () => hd.skip(-10000) }),
        iconButton({ name: "rewind-forward-10", label: "Forward 10 seconds", size: 28, data: { sk: "launcher-fwd" }, onClick: () => hd.skip(10000) }),
      );
    } else {
      this.railFill = null;
      this.pillTime = null;
      p.append(
        sep(),
        iconButton({
          name: "book",
          label: "Reader view",
          size: 32,
          data: { sk: "launcher-reader" },
          onClick: () => {
            this.setPill(false, true);
            hd.openReader();
          },
        }),
      );
    }
    const sp = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-speed", "aria-label": `Speed ${speedLabel(m.speed)}`, "data-sk": "launcher-speed" }, speedLabel(m.speed));
    sp.addEventListener("click", () => shell.togglePopover("speed", sp, () => speedPopover({ speed: () => this.m.speed, onSet: (v) => hd.setSpeed(v) }), beside(l.side)));
    const vc = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--icon sk-vc", "aria-label": "Voice", "data-sk": "launcher-voice" });
    const av = avatar(m.voiceName, 24, "accent");
    vc.append(av);
    vc.addEventListener("click", () =>
      shell.togglePopover(
        "voice",
        vc,
        () => voicePopover({ voices: () => hd.voices(), current: () => this.m.voice, onPick: (v) => hd.setVoice(v.id), onPreview: (id) => hd.previewVoice(id), alive: (el) => el.isConnected }),
        beside(l.side),
      ),
    );
    this.pillSpeed = sp;
    this.pillVoice = av;
    const last = reading
      ? iconButton({ name: "player-stop", label: "Stop", size: 32, data: { sk: "launcher-stop" }, onClick: () => hd.stop() })
      : iconButton({ name: "dots-vertical", label: "More", size: 32, data: { sk: "launcher-more" }, onClick: () => shell.togglePopover("menu", last, () => this.menu(), beside(l.side)) });
    p.append(sp, vc, last);
    this.drag(p);
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
    p.classList.add("is-out");
    shell.root.append(p);
    p.style.top = `${this.pillTop(p)}px`;
    requestAnimationFrame(() => p.classList.remove("is-out"));
    this.pill = p;
  }

  private menu(): HTMLElement {
    const { shell, hd } = this.s;
    const m = menu(
      menuItem({
        label: "Settings",
        icon: "adjustments",
        onSelect: () => {
          shell.closePopover();
          hd.openOptions();
        },
      }),
      menuItem({
        label: "Hide on this site",
        icon: "eye-off",
        onSelect: () => {
          shell.closePopover();
          hd.hideOnSite();
        },
      }),
    );
    m.classList.add("sk-menu");
    m.querySelectorAll<HTMLElement>("button").forEach((b, i) => (b.dataset.sk = ["menu-settings", "menu-hide-site"][i]!));
    return m;
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
      const hintText = reading ? "Space" : m.engineAsleep ? "Wakes on play" : m.estimate() ? clock(m.estimate()) : "";
      hint.textContent = hintText;
      hint.hidden = !hintText;
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
