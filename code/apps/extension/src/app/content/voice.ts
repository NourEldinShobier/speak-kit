import { VOICE_PORT, type ContentToBg, type VoiceDown, type VoicePage, type VoiceProblem, type VoiceUp, type VoiceView } from "@speakkit/protocol";
import { VOICE_CSS, VoicePill, askConsent, type PillAction } from "../../features/voicechat";
import type { ExtraToBg } from "../../shared/internal";
import { LINKS } from "../../shared/links";
import { ShadowShell } from "./shell";
import shellCss from "./shell.css?inline";

/** Entry of content-voice.js: the voice pill, the first-use card and the port to the worker. Loaded when the user first asks to talk. */
export interface VoiceDeps {
  /** the page as text, with the selection, at this moment */
  page(): VoicePage;
  /** a conversation opened or closed (the launcher button follows) */
  onOpen(open: boolean): void;
  post(msg: ContentToBg | ExtraToBg): void;
  openReader(): void;
}

const CONSENT_KEY = "speakkit.voiceConsent";
const HINT = "Just talk. Click the mic to mute.";
const HINT_MS = 5000;
const CHURN_MS = 1500;
/** Added text, in characters, that makes the page "changed": a quarter of what the conversation started with, at least this much. */
const CHURN_MIN = 1500;

export class Voice {
  private shell: ShadowShell | null = null;
  private pill: VoicePill | null = null;
  private port: chrome.runtime.Port | null = null;
  private view: VoiceView = { phase: "connecting", muted: false };
  private notice: VoiceProblem | undefined;
  private starting = false;
  private watch: MutationObserver | null = null;
  private churn = 0;
  private baseline = 0;
  private churnTimer: ReturnType<typeof setTimeout> | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly d: VoiceDeps;
  constructor(d: VoiceDeps) {
    this.d = d;
  }

  /** A conversation is open or opening (not "ended"). */
  get open() {
    return !!this.port;
  }

  toggle() {
    if (this.open || this.starting) this.end();
    else void this.start();
  }

  async start() {
    if (this.open || this.starting) return;
    this.starting = true;
    try {
      const first = !(await chrome.storage.local.get(CONSENT_KEY))[CONSENT_KEY];
      this.dismiss();
      if (first) {
        if (!(await askConsent(this.ensureShell()))) return void this.dismiss();
        void chrome.storage.local.set({ [CONSENT_KEY]: true });
      }
      this.connect(first);
    } catch {
      this.dismiss(); // the extension was reloaded under this page
    } finally {
      this.starting = false;
    }
  }

  private ensureShell() {
    if (!this.shell) {
      this.shell = new ShadowShell([shellCss, VOICE_CSS]);
      this.shell.setResizeHandler(() => this.show());
    }
    return this.shell;
  }

  private connect(first: boolean) {
    const page = this.d.page();
    const port = chrome.runtime.connect({ name: VOICE_PORT });
    this.port = port;
    port.onMessage.addListener((m: VoiceDown) => this.onDown(m));
    port.onDisconnect.addListener(() => {
      if (this.port === port) this.finished({ phase: "ended", muted: this.view.muted });
    });
    this.view = { phase: "connecting", muted: false };
    this.notice = undefined;
    this.pill = new VoicePill(this.ensureShell(), { mute: (on) => this.mute(on), end: () => this.end(), act: (a) => this.act(a) });
    this.show();
    if (first) {
      this.pill.showHint(HINT);
      this.hintTimer = setTimeout(() => this.pill?.hideHint(), HINT_MS);
    }
    this.send({ t: "start", page });
    this.d.onOpen(true);
    this.baseline = page.text.length;
    this.churn = 0;
    this.watch = new MutationObserver((records) => this.onMutations(records));
    if (document.body) this.watch.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  private onDown(m: VoiceDown) {
    if (m.t === "level") return this.pill?.level(m.v);
    this.view = m.view;
    if (m.view.phase === "listening") this.pill?.hideHint();
    if (m.view.phase === "ended") this.finished(m.view);
    else this.show();
  }

  private show() {
    this.pill?.render(this.view, this.notice);
  }

  /** The conversation is over (ended by the user, the session or the page): the pill stays as "Conversation ended" or the problem. */
  private finished(view: VoiceView) {
    this.view = view;
    this.stopWatching();
    const port = this.port;
    this.port = null;
    port?.disconnect();
    this.pill?.hideHint();
    this.d.onOpen(false);
    this.notice = undefined;
    this.show();
  }

  private send(m: VoiceUp) {
    try {
      this.port?.postMessage(m);
    } catch {
      /* the port closed: onDisconnect ends the conversation */
    }
  }

  private mute(on: boolean) {
    this.send({ t: "mute", on });
    this.view = { ...this.view, muted: on, phase: on && this.view.phase === "listening" ? "idle" : this.view.phase };
    this.show();
  }

  /** The end button: ends an open conversation; on a finished pill it removes it. */
  end() {
    if (this.port) {
      this.send({ t: "end" });
      this.finished({ phase: "ended", muted: this.view.muted });
    } else this.dismiss();
  }

  /** The page moved on (another address in a single-page app): the conversation is about the old one until Update. */
  pageMoved() {
    if (this.port) this.setNotice();
  }

  private onMutations(records: MutationRecord[]) {
    for (const r of records) {
      if (r.type === "characterData") this.churn += (r.target.textContent ?? "").length;
      else for (const n of r.addedNodes) this.churn += (n.textContent ?? "").length;
    }
    clearTimeout(this.churnTimer);
    this.churnTimer = setTimeout(() => this.churn > Math.max(CHURN_MIN, this.baseline / 4) && this.setNotice(), CHURN_MS);
  }

  private setNotice() {
    if (this.notice || this.view.problem) return;
    this.notice = "page-changed";
    this.show();
  }

  private stopWatching() {
    this.watch?.disconnect();
    this.watch = null;
    clearTimeout(this.churnTimer);
  }

  private act(a: PillAction | "keep-going" | "talk-again") {
    const post = (m: ContentToBg | ExtraToBg) => this.d.post(m);
    if (a === "keep-going") return this.send({ t: "keep-going" });
    if (a === "update") {
      const page = this.d.page();
      this.send({ t: "update", page });
      this.baseline = page.text.length;
      this.churn = 0;
      this.notice = undefined;
      return this.show();
    }
    if (a === "retry" || a === "use-selection" || a === "talk-again") {
      this.dismiss();
      return void this.start();
    }
    if (a === "manage-plan") window.open(LINKS.billing, "_blank", "noopener");
    else if (a === "allow-mic") post({ t: "open-options", section: "voicechat" });
    else if (a === "settings") post({ t: "open-options" });
    else if (a === "reader") this.d.openReader();
    else post({ t: "open-app" }); // set-up, check-key, open-app: the key lives in the app
    if (!this.port) this.dismiss();
  }

  /** Removes the pill, the card and the shell. */
  dismiss() {
    clearTimeout(this.hintTimer);
    this.stopWatching();
    this.pill?.destroy();
    this.pill = null;
    this.shell?.destroy();
    this.shell = null;
  }

  /** The page is going away or the extension was reloaded: close the port and remove everything. */
  destroy() {
    const port = this.port;
    this.port = null;
    port?.disconnect();
    this.dismiss();
    this.d.onOpen(false);
  }
}

export const createVoice = (d: VoiceDeps) => new Voice(d);
