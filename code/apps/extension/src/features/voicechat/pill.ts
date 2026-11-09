import type { VoiceProblem, VoiceView } from "@speakkit/protocol";
import { button, h, icon } from "@speakkit/ui/vanilla";
import type { Shell } from "../../shared/ui-types";
import { PROBLEMS, type PillAction } from "./errors";
import { COLS, COLS_NARROW, ROWS, gridPattern } from "./grid";

/** What the pill's buttons ask for. */
export interface PillHandlers {
  mute(on: boolean): void;
  end(): void;
  /** the action button of a notice, or "keep-going" / "talk-again" */
  act(action: PillAction | "keep-going" | "talk-again"): void;
}

const NARROW_PX = 400;
const TICK_MS = 100;
/** How long "Conversation ended" stays. Problems stay until the user acts. */
const ENDED_MS = 8000;
const SPOKEN: Record<VoiceView["phase"], string> = {
  connecting: "Connecting",
  idle: "Ready. Say something.",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting",
  "idle-warning": "Still there?",
  ended: "Conversation ended",
};

/** The voice pill at the top centre of the page: mute, a 15 x 4 dot grid and the end button; error and notice pills take its place. */
export class VoicePill {
  private el: HTMLElement | null = null;
  private live = h("span", { class: "sk-sr" });
  private dots: HTMLElement[] = [];
  private tones: number[] = [];
  private mute: HTMLButtonElement | null = null;
  private hint: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private endedTimer: ReturnType<typeof setTimeout> | undefined;
  private tick = 0;
  private lvl = 0;
  private key = "";
  private view: VoiceView = { phase: "connecting", muted: false };
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)");

  private readonly shell: Shell;
  private readonly hd: PillHandlers;
  constructor(shell: Shell, hd: PillHandlers) {
    this.shell = shell;
    this.hd = hd;
  }

  private get cols() {
    return this.shell.width < NARROW_PX ? COLS_NARROW : COLS;
  }

  /** `notice` is a problem of the page (it changed) shown over a conversation that is still open. */
  render(view: VoiceView, notice?: VoiceProblem) {
    this.view = view;
    const problem = view.problem ?? notice;
    const key = problem ? `p:${problem}` : view.phase === "reconnecting" || view.phase === "idle-warning" || view.phase === "ended" ? view.phase : `grid:${this.cols}`;
    if (key !== this.key || !this.el) this.build(key, problem);
    if (view.phase === "ended") this.endedTimer ??= setTimeout(() => this.hd.end(), ENDED_MS);
    else {
      clearTimeout(this.endedTimer);
      this.endedTimer = undefined;
    }
    this.patch(problem);
  }

  /** The microphone or voice level, 0 to 1. */
  level(v: number) {
    this.lvl = v;
    if (this.key.startsWith("grid")) this.draw();
  }

  /** The dark hint under the pill on a first conversation. */
  showHint(text: string) {
    this.hint?.remove();
    this.hint = h("div", { class: "sk-vp-hint", role: "note" }, text);
    this.shell.root.append(this.hint);
  }
  hideHint() {
    this.hint?.remove();
    this.hint = null;
  }

  destroy() {
    clearInterval(this.timer);
    clearTimeout(this.endedTimer);
    this.el?.remove();
    this.hint?.remove();
    this.el = this.hint = null;
  }

  private build(key: string, problem: VoiceProblem | undefined) {
    this.key = key;
    const hadFocus = !!this.el && (this.shell.root.getRootNode() as ShadowRoot).activeElement?.closest(".sk-vp") === this.el;
    const el = h("div", { class: "sk-vp", role: "status", "aria-live": "polite", "data-sk": "voice-pill" });
    if (key.startsWith("grid")) this.buildGrid(el);
    else this.buildNotice(el, problem);
    el.append(this.live);
    this.el?.replaceWith(el);
    if (!this.el) this.shell.root.append(el);
    this.el = el;
    if (hadFocus) el.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }

  private endButton(label: string) {
    const b = h("button", { type: "button", class: "sk-vp-end", "aria-label": label, "data-sk": "voice-end" }, h("span"));
    b.addEventListener("click", () => this.hd.end());
    return b;
  }

  private buildGrid(el: HTMLElement) {
    const cols = this.cols;
    el.classList.toggle("is-narrow", cols === COLS_NARROW);
    this.mute = h(
      "button",
      { type: "button", class: "lm-btn lm-btn--icon lm-btn--ghost sk-vp-mute", "aria-label": "Mute microphone", "aria-pressed": "false", "data-sk": "voice-mute" },
      icon("microphone", 16),
    );
    this.mute.addEventListener("click", () => this.hd.mute(!this.view.muted));
    this.dots = Array.from({ length: ROWS * cols }, () => h("i"));
    this.tones = this.dots.map(() => -1);
    const grid = h("div", { class: "sk-vp-grid", "aria-hidden": "true", "data-sk": "voice-grid", style: `--cols:${cols}` }, ...this.dots);
    el.append(this.mute, grid, this.endButton("End conversation"));
    clearInterval(this.timer);
    this.timer = this.still.matches ? undefined : setInterval(() => this.step(), TICK_MS);
  }

  private buildNotice(el: HTMLElement, problem: VoiceProblem | undefined) {
    clearInterval(this.timer);
    this.timer = undefined;
    el.classList.add("sk-vp--notice");
    const v = this.view;
    const p = problem ? PROBLEMS[problem] : undefined;
    const act = (a: PillAction | "keep-going" | "talk-again") => () => this.hd.act(a);
    const tag = (b: HTMLButtonElement, sk: string) => ((b.dataset.sk = sk), b);
    if (p) el.append(h("span", { class: "sk-vp-alert" }, icon("alert-triangle", 16)));
    el.append(h("span", { class: "sk-vp-text", "data-sk": "voice-text" }));
    if (p) el.append(tag(button({ variant: "primary", size: "sm", label: p.label, onClick: act(p.action) }), "voice-action"));
    else if (v.phase === "idle-warning")
      el.append(
        tag(button({ variant: "primary", size: "sm", label: "Keep going", onClick: act("keep-going") }), "voice-action"),
        tag(button({ variant: "secondary", size: "sm", label: "End", onClick: () => this.hd.end() }), "voice-end"),
      );
    else if (v.phase === "ended") el.append(tag(button({ variant: "primary", size: "sm", label: "Talk again", onClick: act("talk-again") }), "voice-action"));
    if (v.phase !== "ended" && v.phase !== "idle-warning") el.append(this.endButton("End conversation"));
  }

  private patch(problem: VoiceProblem | undefined) {
    const v = this.view;
    const text = problem
      ? PROBLEMS[problem].text
      : v.phase === "reconnecting"
        ? `Reconnecting, ${v.attempt ?? 1} of 5`
        : v.phase === "idle-warning"
          ? `Still there? ${v.secondsLeft ?? 30} s`
          : v.phase === "ended"
            ? "Conversation ended"
            : "";
    const t = this.el?.querySelector<HTMLElement>("[data-sk=voice-text]");
    if (t && t.textContent !== text) t.textContent = text;
    const said = problem || !this.key.startsWith("grid") ? text : v.muted ? "Microphone muted" : SPOKEN[v.phase];
    // The live region announces state changes only: not every second of the idle countdown.
    const announce = v.phase === "idle-warning" ? "Still there?" : said;
    if (this.live.textContent !== announce) this.live.textContent = announce;
    if (this.el) this.el.dataset.phase = problem ? "problem" : v.phase;
    if (this.mute) {
      this.mute.setAttribute("aria-pressed", String(v.muted));
      this.mute.setAttribute("aria-label", v.muted ? "Unmute microphone" : "Mute microphone");
      this.mute.classList.toggle("is-muted", v.muted);
      this.mute.replaceChildren(icon(v.muted ? "microphone-off" : "microphone", 16));
    }
    this.draw();
  }

  private step() {
    this.tick++;
    this.draw();
  }

  private draw() {
    if (!this.dots.length || !this.key.startsWith("grid")) return;
    const still = this.still.matches;
    const level = still ? (this.view.phase === "listening" || this.view.phase === "speaking" ? 0.5 : 0) : this.lvl;
    const tones = gridPattern({ phase: this.view.phase, muted: this.view.muted, level, tick: still ? 0 : this.tick, cols: this.cols });
    tones.forEach((t, i) => {
      if (this.tones[i] === t) return;
      this.tones[i] = t;
      this.dots[i]!.className = `t${t}`;
    });
  }
}
