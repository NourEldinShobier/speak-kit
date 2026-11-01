import type { PlayerStatus } from "@speakkit/protocol";
import { avatar, button, h, icon, iconButton, logo, menu, menuItem, progress } from "@speakkit/ui/vanilla";
import { errorText } from "../connection";
import { above } from "../../shared/placement";
import { clock, minutesLeft, speedLabel } from "../../shared/format";
import type { Shell, UiHandlers, UiModel } from "../../shared/ui-types";
import { speedPopover } from "./speed-popover";
import { voicePopover } from "../voices";

const ACTIVE: PlayerStatus[] = ["preparing", "playing", "paused"];
const fmtLong = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};

/**
 * The floating read-aloud pill (Lumen F5): previous paragraph, a 40 px play/pause, next paragraph, "Paragraph n of N · x min left"
 * over a thin progress bar, speed pill, voice chip ("Heart · on device") and close. Lumen kit buttons, progress bar and popovers.
 */
export class Dock {
  el: HTMLElement | null = null;
  private extra: HTMLElement[] = [];
  private key = "";
  private dismissed: PlayerStatus | null = null;
  private details = false;
  private m: UiModel;
  private parts: { text?: HTMLElement; sub?: HTMLElement; speed?: HTMLElement; voice?: HTMLElement; av?: HTMLElement; bar?: { set(): void } } = {};
  private waking = 0;
  private preparingSince = 0;

  constructor(private shell: Shell, private hd: UiHandlers, m: UiModel) {
    this.m = m;
  }

  /** The dock is shown for errors, for the always-dock site rule, when finished, and while reading if no launcher exists. */
  visible(): boolean {
    const m = this.m;
    if (m.status === "error") return !this.dismissed || this.dismissed !== "error";
    if (this.dismissed === m.status) return false;
    if (m.alwaysDock) return true;
    if (!m.showDock) return false;
    if (m.status === "idle") return false;
    return !m.launcher || m.status === "finished";
  }

  dismiss() {
    this.dismissed = this.m.status;
    this.details = false;
    this.key = "?";
    this.render(this.m);
    if (ACTIVE.includes(this.m.status)) this.hd.stop();
  }

  render(m: UiModel) {
    const prev = this.m;
    this.m = m;
    if (prev.status !== m.status && this.dismissed && this.dismissed !== m.status) this.dismissed = null;
    if (m.status === "preparing" && prev.status !== "preparing") this.preparingSince = performance.now();
    const visible = this.visible();
    const key = visible ? `${m.status}|${m.error?.code ?? ""}|${m.dark}|${this.details}` : "";
    if (key !== this.key) {
      this.key = key;
      this.build(visible);
    }
    this.patch();
  }

  destroy() {
    clearTimeout(this.waking);
    this.el?.remove();
    for (const e of this.extra) e.remove();
  }

  private clear() {
    if (this.shell.popover && this.el?.contains(this.shell.popover.anchor)) this.shell.closePopover();
    this.parts = {};
    this.el?.remove();
    for (const e of this.extra) e.remove();
    this.extra = [];
    this.el = null;
    clearTimeout(this.waking);
  }

  private moreButton() {
    const b = iconButton({ name: "dots-vertical", label: "More", size: 28, data: { sk: "dock-more" }, className: "sk-dock-more" });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      this.shell.togglePopover("menu", b, () => this.menu(), above(() => this.el));
    });
    return b;
  }

  private menu(): HTMLElement {
    const m = menu(
      menuItem({ label: "Settings", icon: "adjustments", onSelect: () => { this.shell.closePopover(); this.hd.openOptions(); } }),
      menuItem({ label: "Close", icon: "x", onSelect: () => { this.shell.closePopover(); this.dismiss(); } }),
      menuItem({ label: "Hide on this site", icon: "eye-off", onSelect: () => { this.shell.closePopover(); this.hd.hideOnSite(); } }),
    );
    m.classList.add("sk-menu");
    m.querySelectorAll<HTMLElement>("button").forEach((b, i) => (b.dataset.sk = ["menu-settings", "menu-close", "menu-hide-site"][i]!));
    return m;
  }

  private build(visible: boolean) {
    this.clear();
    if (!visible) return;
    const m = this.m;
    const d = h("div", { class: "sk-dock", "data-sk": "dock", "data-state": m.status, role: "region", "aria-label": "SpeakKit player" });
    this.el = d;
    if (m.status === "error") return this.buildError(d);
    if (m.status === "idle") {
      const sub = h("span", { class: "sk-sub" });
      this.parts.sub = sub;
      const play = iconButton({ name: "player-play", label: "Read this page", data: { sk: "dock-play" }, className: "lm-btn--primary sk-play", round: true });
      play.classList.add("lm-btn--primary");
      play.addEventListener("click", () => this.hd.listen());
      play.addEventListener("pointerenter", () => this.hd.warm("dock"));
      d.append(logo(28), h("div", { class: "sk-col" }, h("span", { class: "sk-msg" }, "Read this page"), sub), play, this.moreButton());
      this.shell.root.append(d);
      return;
    }
    const loading = m.status === "preparing";
    const done = m.status === "finished";
    const playing = m.status === "playing";
    const prev = iconButton({ name: "player-skip-back", label: "Previous paragraph", size: 28, data: { sk: "dock-prev" }, disabled: loading || done, onClick: () => this.hd.prevBlock() });
    const next = iconButton({ name: "player-skip-forward", label: "Next paragraph", size: 28, data: { sk: "dock-next" }, disabled: loading || done, onClick: () => this.hd.nextBlock() });
    const toggle = h(
      "button",
      { type: "button", class: "lm-btn lm-btn--primary lm-btn--icon lm-btn--round sk-play", "aria-label": done ? "Replay" : playing ? "Pause" : loading ? "Preparing" : "Play", "data-sk": "dock-toggle", disabled: loading },
      icon(loading ? "loader-2" : done ? "refresh" : playing ? "player-pause" : "player-play", 18, loading ? "lm-spin" : undefined),
    );
    toggle.addEventListener("click", () => (done ? this.hd.replay() : this.hd.toggle()));
    toggle.addEventListener("pointerenter", () => this.hd.warm("dock"));
    const text = h("span", { class: "sk-dock-text" });
    const bar = this.seekBar(!loading && !done);
    const mid = h("div", { class: "sk-dock-mid" }, text, bar.el);
    const speed = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-speed", "aria-label": `Speed ${speedLabel(m.speed)}`, "data-sk": "dock-speed" });
    speed.addEventListener("click", () => this.shell.togglePopover("speed", speed, () => speedPopover({ speed: () => this.m.speed, onSet: (v) => this.hd.setSpeed(v) }), above(() => this.el)));
    const av = avatar(m.voiceName, 20, "accent");
    const vtext = h("span", { class: "sk-voice-txt" });
    const voice = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-voicechip", "data-sk": "dock-voice" }, h("span", { class: "sk-sr" }, "Voice: "), av, vtext, icon("chevron-down", 12));
    av.setAttribute("aria-hidden", "true");
    voice.addEventListener("click", () => this.shell.togglePopover("voice", voice, () => this.voices(), above(() => this.el)));
    const close = iconButton({ name: "x", label: "Close player", size: 28, data: { sk: "dock-close" }, onClick: () => this.dismiss() });
    d.append(prev, toggle, next, mid, speed, voice, this.moreButton(), close);
    this.parts = { text, speed, voice: vtext, av, bar };
    this.shell.root.append(d);
    // "Preparing" is quick when the model is loaded; after a moment it means the model is being woken up.
    if (loading) this.waking = window.setTimeout(() => this.patch(), 1200);
  }

  private voices() {
    return voicePopover({
      voices: () => this.hd.voices(),
      current: () => this.m.voice,
      onPick: (v) => this.hd.setVoice(v.id),
      onPreview: (id) => this.hd.previewVoice(id),
      alive: (el) => el.isConnected,
    });
  }

  private buildError(d: HTMLElement) {
    const m = this.m;
    const et = errorText(m.error?.code, m.error?.message);
    const ic = icon("alert-circle", 18, "sk-err-ic");
    d.append(logo(28), ic, h("span", { class: "sk-msg" }, et.title));
    const act = (label: string, sk: string, run: () => void, primary = false) => {
      const b = button({ variant: primary ? "primary" : "secondary", size: "sm", label, onClick: run });
      b.dataset.sk = sk;
      return b;
    };
    if (et.actions.includes("open-app")) d.append(act("Open app", "dock-open-app", () => this.hd.openApp(), true));
    if (et.actions.includes("settings")) d.append(act("Settings", "dock-settings", () => this.hd.openOptions(), true));
    if (et.actions.includes("retry")) d.append(act("Retry", "dock-retry", () => this.hd.retry()));
    d.append(this.moreButton());
    d.classList.add("is-raised");
    this.shell.root.append(d);
    const det = button({ variant: "ghost", size: "sm", label: "Details", iconRight: this.details ? "chevron-up" : "chevron-down", onClick: () => { this.details = !this.details; this.key = ""; this.render(this.m); } });
    det.classList.add("sk-details");
    det.dataset.sk = "dock-details";
    this.shell.root.append(det);
    this.extra.push(det);
    if (this.details) {
      const t = h("div", { class: "sk-dtext", "data-sk": "dock-details-text" }, `${m.error?.code ?? "error"}: ${m.error?.message ?? "No further detail was reported."}`);
      this.shell.root.append(t);
      this.extra.push(t);
    }
  }

  /** Thin progress bar (Lumen progress) with click and drag to seek. */
  private seekBar(enabled: boolean) {
    const pr = progress(0, { thin: true, label: "Progress" });
    const el = h("div", { class: "sk-seek", "data-sk": "seek" }, pr.el);
    let drag: number | null = null;
    const frac = () => (this.m.totalMs > 0 ? Math.min(1, Math.max(0, this.m.elapsedMs / this.m.totalMs)) : 0);
    const set = () => pr.set((drag ?? (this.m.status === "finished" ? 1 : frac())) * 100);
    const at = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    if (enabled) {
      el.classList.add("is-seekable");
      el.addEventListener("pointerdown", (e) => { drag = at(e); el.setPointerCapture(e.pointerId); set(); });
      el.addEventListener("pointermove", (e) => { if (drag !== null) { drag = at(e); set(); } });
      el.addEventListener("pointerup", (e) => { if (drag !== null) { const f = at(e); drag = null; this.hd.seekFrac(f); set(); } });
      el.addEventListener("pointercancel", () => { drag = null; set(); });
    }
    return { el, set };
  }

  /** Per-state texts, called on every model update. */
  patch() {
    const m = this.m;
    if (!this.el) return;
    const p = this.parts;
    if (p.sub) p.sub.textContent = m.estimate() ? `${fmtLong(m.estimate())} at ${speedLabel(m.speed)}` : "";
    if (p.text) {
      const waking = m.status === "preparing" && performance.now() - this.preparingSince > 1200;
      p.text.textContent =
        m.status === "preparing" ? (waking ? "Waking the voice engine..." : "Preparing voice...")
        : m.status === "finished" ? "Done · Read again"
        : m.paragraph ? `Paragraph ${m.paragraph.n} of ${m.paragraph.of} · ${minutesLeft(Math.max(0, m.totalMs - m.elapsedMs))}`
        : m.status === "paused" ? `Paused · ${clock(m.elapsedMs)}` : `Reading · ${clock(m.elapsedMs)}`;
    }
    if (p.speed) { p.speed.textContent = speedLabel(m.speed); p.speed.setAttribute("aria-label", `Speed ${speedLabel(m.speed)}`); }
    if (p.voice) p.voice.textContent = p.voice.title = `${m.voiceName || "Voice"} · on device`;
    if (p.av) p.av.textContent = (m.voiceName || "V").slice(0, 1).toUpperCase();
    p.bar?.set();
  }
}
