import { VOICE_PORT, type ContentToBg, type VoiceDown, type VoicePage, type VoiceProblem, type VoiceUp, type VoiceView } from "@speakkit/protocol";
import { VOICE_CSS, VoicePill, askConsent, mayHaveChangedContent, pageChanged, type PillAction } from "../../features/voicechat";
import type { ExtraToBg } from "../../shared/internal";
import { giveVoiceConsent, hasVoiceConsent } from "../../shared/voice-consent";
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

/** Where a user adds credit to an OpenAI account; opened in their browser. */
const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";
const HINT = "Just talk. Click the mic to mute.";
const RECONNECTED = "Reconnected. The model lost what was said before.";
const HINT_MS = 5000;
/** How soon after a content change the page is measured again (at most once per period, so a ticking page costs little). */
const CHURN_MS = 1500;

export class Voice {
  private shell: ShadowShell | null = null;
  private pill: VoicePill | null = null;
  private port: chrome.runtime.Port | null = null;
  private view: VoiceView = { phase: "connecting", muted: false };
  private notice: VoiceProblem | undefined;
  private starting = false;
  private consent: AbortController | null = null;
  private watch: MutationObserver | null = null;
  private baseline = 0;
  private startedAt = 0;
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
      const first = !(await hasVoiceConsent());
      this.dismiss();
      if (first) {
        const asking = (this.consent = new AbortController()); // ending the conversation while the card is open declines it
        const agreed = await askConsent(this.ensureShell(), asking.signal);
        if (this.consent === asking) this.consent = null;
        if (!agreed) return void this.dismiss();
        void giveVoiceConsent();
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
    this.startedAt = Date.now();
    this.notice = undefined;
    this.pill = new VoicePill(this.ensureShell(), { mute: (on) => this.mute(on), end: () => this.end(), act: (a) => this.act(a) });
    this.show();
    if (first) this.hint(HINT);
    this.send({ t: "start", page });
    this.d.onOpen(true);
    this.baseline = page.text.length;
    this.watch = new MutationObserver((records) => this.onMutations(records));
    if (document.body) this.watch.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  private onDown(m: VoiceDown) {
    if (m.t === "level") return this.pill?.level(m.v);
    const reconnected = this.view.phase === "reconnecting" && m.view.phase === "idle";
    this.view = m.view;
    if (m.view.phase === "listening") this.pill?.hideHint();
    else if (reconnected) this.hint(RECONNECTED);
    if (m.view.phase === "ended") this.finished(m.view);
    else this.show();
  }

  private show() {
    this.pill?.render(this.view, this.notice);
  }

  /** The conversation is over (ended by the user, the session or the page): the pill stays as "Conversation ended" or the problem. */
  private finished(view: VoiceView) {
    const usage = view.usage ?? this.view.usage; // an ending from this side (the End button, a lost port) has not heard the final cost yet
    this.view = usage && !view.problem ? { ...view, usage: { ...usage, seconds: Math.round((Date.now() - this.startedAt) / 1000) } } : view;
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

  private hint(text: string) {
    clearTimeout(this.hintTimer);
    this.pill?.showHint(text);
    this.hintTimer = setTimeout(() => this.pill?.hideHint(), HINT_MS);
  }

  /** Content changed (not a script, a style or a ticking clock): measure the main text once, soon, and compare it with what the conversation started with. */
  private onMutations(records: MutationRecord[]) {
    if (this.notice || this.churnTimer || !mayHaveChangedContent(records)) return;
    this.churnTimer = setTimeout(() => {
      this.churnTimer = undefined;
      if (this.port && pageChanged(this.baseline, this.d.page().text.length)) this.setNotice();
    }, CHURN_MS);
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
    this.churnTimer = undefined;
  }

  private act(a: PillAction | "keep-going" | "talk-again") {
    const post = (m: ContentToBg | ExtraToBg) => this.d.post(m);
    if (a === "keep-going") return this.send({ t: "keep-going" });
    if (a === "update") {
      const page = this.d.page();
      this.send({ t: "update", page });
      this.baseline = page.text.length;
      this.notice = undefined;
      return this.show();
    }
    if (a === "retry" || a === "use-selection" || a === "talk-again") {
      this.dismiss();
      return void this.start();
    }
    if (a === "manage-plan") window.open(BILLING_URL, "_blank", "noopener");
    else if (a === "allow-mic") post({ t: "open-options", section: "voicechat" });
    else if (a === "settings") post({ t: "open-options" });
    else if (a === "reader") this.d.openReader();
    else post({ t: "open-app" }); // set-up, check-key, open-app: the key lives in the app
    if (!this.port) this.dismiss();
  }

  /** Removes the pill, the card and the shell. */
  dismiss() {
    this.consent?.abort();
    this.consent = null;
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
