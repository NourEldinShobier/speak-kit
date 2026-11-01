/// <reference types="chrome" />
import { SETTINGS_KEY, type BgToContent, type ContentToBg, type PlayerCommand, type PlayerState, type ReadDoc, type SiteRule } from "@speakkit/protocol";
import { extract, type ReaderView } from "../../features/reader";
import { defaultSettings, siteRule, type Settings } from "../../features/settings";
import type { ExtraToBg, VoiceInfo } from "../../shared/internal";
import type { UiModel } from "../../shared/ui-types";
import type { Ctx, Current, Doc, ReadMode } from "./context";
import { Docs } from "./docs";
import { EngineWake, loadSettings, saveSettings } from "./bridge";
import { Follow, Playback } from "./playback";
import { makeHandlers } from "./handlers";
import { PageInput } from "./input";
import { defer, loadUi, type Deferred } from "./lazy";
import { ACTIVE, asPlayerState } from "./player-state";
import { ReaderSession } from "./reader-session";
import type { Ui } from "./ui";

/** The lazy half of the content script: settings, extraction, highlight and the Shadow DOM UI. Loaded by index.ts. */

const ESTIMATE_TTL_MS = 20000;
const CHARS_PER_SECOND = 15;

/** Composes the parts of the content script (documents, playback, follow, reader, input) around the shared state they read and write. */
class Controller implements Ctx {
  settings: Settings = defaultSettings();
  state: PlayerState | null = null;
  ui: Deferred<Ui> | null = null;
  docs = new Map<string, Doc>();
  current: Current | null = null;
  lastDoc: ReadDoc | null = null;
  reader: ReaderView | null = null;
  readerDoc: string | null = null;
  voices: VoiceInfo[] = [];
  /** The paragraph play buttons only appear once the user has started reading on this page load. */
  private engaged = false;
  private est: { t: number; chars: number } | null = null;

  private readonly ac = new AbortController();
  private readonly docsPart = new Docs(this);
  private readonly follow = new Follow(this);
  private readonly playback = new Playback(this, this.follow);
  private readonly session = new ReaderSession(this, this.docsPart);
  private readonly input = new PageInput(this, this.docsPart);
  private readonly wake = new EngineWake(
    (msg, cb) => this.post(msg, cb),
    () => this.refresh(),
  );
  private readonly handlers = makeHandlers(this, { docs: this.docsPart, follow: this.follow, reader: this.session });
  private readonly onStorage = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "sync" && ch[SETTINGS_KEY]) void this.reloadSettings().then(() => this.refresh());
  };

  async init() {
    await this.reloadSettings();
    const { signal } = this.ac;
    chrome.storage.onChanged.addListener(this.onStorage);
    this.input.listen(signal);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.refresh(), { signal });
    this.playback.restyle();
    this.refresh();
    // pick up a reading that is already running (page reloaded or UI enabled mid-reading)
    this.post({ t: "get-state" }, (r) => {
      const st = asPlayerState(r);
      if (st && !this.state) this.onState(st);
    });
  }

  // ------------------------------------------------------------ settings and model

  private async reloadSettings() {
    this.settings = await loadSettings();
  }
  async saveSettings(mut: (s: Settings) => void) {
    const s = await saveSettings(mut);
    if (s) this.settings = s;
  }

  /** Removes every listener the controller added (the page is going away or the extension was reloaded). */
  dispose() {
    this.ac.abort();
    chrome.storage.onChanged.removeListener(this.onStorage);
  }

  get host() {
    return location.hostname.replace(/^www\./, "");
  }
  get reading() {
    return !!this.state && ACTIVE.includes(this.state.status);
  }
  rule() {
    return siteRule(this.settings, location.href);
  }

  private voiceName(id: string) {
    return this.voices.find((v) => v.id === id)?.name ?? id.replace(/^[a-z]{2}_/, "").replace(/^./, (c) => c.toUpperCase());
  }

  private estimate = () => {
    const now = performance.now();
    if (!this.est || now - this.est.t > ESTIMATE_TTL_MS) {
      const ex = extract(document, { skip: this.settings.skip });
      let chars = 0;
      for (const s of ex.sentences) chars += s.text.length;
      this.est = { t: now, chars };
    }
    return (this.est.chars / CHARS_PER_SECOND / Math.max(0.5, this.state?.speed ?? this.settings.speed)) * 1000;
  };

  /** "Paragraph n of N": blocks of the document being read, counted from 1. */
  private paragraph(): UiModel["paragraph"] {
    const st = this.state;
    const d = st?.docId ? this.docs.get(st.docId) : undefined;
    const s = d?.doc.sentences[st!.sentenceIndex];
    if (!d || !s) return undefined;
    const n = d.blocks.indexOf(s.block) + 1;
    return n > 0 ? { n, of: d.blocks.length } : undefined;
  }

  private readingBlock(): Element | undefined {
    const st = this.state;
    if (!st || !ACTIVE.includes(st.status)) return undefined;
    const d = this.docs.get(st.docId ?? "");
    const block = d?.doc.sentences[st.sentenceIndex]?.block;
    return block === undefined ? undefined : d?.ex.blocks[block]?.el;
  }

  /** The player half of the model. Optional fields are left out, not set to undefined. */
  private playerView(st: PlayerState | null) {
    const s = this.settings;
    const voice = st?.voice ?? s.voice;
    const paragraph = this.paragraph();
    const readingBlock = this.readingBlock();
    return {
      status: st?.status ?? "idle",
      elapsedMs: st?.elapsedMs ?? 0,
      totalMs: st?.totalMs ?? 0,
      speed: st?.speed ?? s.speed,
      voice,
      voiceName: this.voiceName(voice),
      estimate: this.estimate,
      ...(st?.error && { error: st.error }),
      ...(paragraph && { paragraph }),
      ...(readingBlock && { readingBlock }),
    };
  }

  /** Which surfaces the settings and the site rule allow. */
  private surfaces(rule: SiteRule | undefined) {
    const s = this.settings;
    const off = rule === "hide-controls" || rule === "never-read";
    return {
      showDock: s.show.dock && !off,
      alwaysDock: rule === "always-dock",
      launcher: s.launcher.enabled && !off ? s.launcher : null,
      showBubble: s.show.bubble && !off,
      showGutter: s.show.gutter && !off && this.engaged,
    };
  }

  model(): UiModel {
    const rule = this.rule();
    const st = rule === "never-read" ? null : this.state;
    return {
      ...this.playerView(st),
      ...this.surfaces(rule),
      dark: this.playback.dark,
      engineAsleep: this.wake.asleep && (st?.status ?? "idle") === "idle",
      readerOpen: !!this.reader,
    };
  }

  private wantsUi(m: UiModel) {
    return !!m.launcher || m.alwaysDock || m.showBubble || m.showGutter || (m.showDock && m.status !== "idle") || m.status === "error";
  }

  /** Create the UI on demand and push the current model. */
  refresh() {
    const m = this.model();
    if (!this.ui) {
      if (!this.wantsUi(m)) return;
      this.ui = this.makeUi(m);
    } else this.ui.render(m);
    this.follow.sync();
  }
  ensureUi() {
    if (!this.ui) this.ui = this.makeUi(this.model());
    return this.ui;
  }
  /** The UI lives in content-ui.js (loaded now, on first need); the returned handle queues calls until it has arrived. */
  private makeUi(m: UiModel): Deferred<Ui> {
    if (m.alwaysDock) this.wake.check();
    return defer(loadUi(chrome.runtime.getURL("content-ui.js"), this.handlers, m), ["render"]);
  }

  // ------------------------------------------------------------ bg messaging

  post(msg: ContentToBg | ExtraToBg, cb?: (r: unknown) => void) {
    try {
      void chrome.runtime.sendMessage(msg).then(cb, () => {});
    } catch {
      /* extension context invalidated */
    }
  }
  cmd(command: PlayerCommand) {
    this.post({ t: "player", command });
  }
  warm(reason: "hover" | "selection" | "dock") {
    this.wake.warm(reason);
  }
  setSpeed(v: number) {
    this.cmd({ cmd: "set-speed", speed: v });
    if (this.state) this.state = { ...this.state, speed: v };
    this.refresh();
  }

  /** A new player state: the paragraph buttons appear once something has played. */
  private onState(st: PlayerState) {
    if (this.rule() === "never-read") return;
    if (st.status !== "idle") this.engaged = true;
    this.playback.onState(st);
  }

  onMessage(msg: BgToContent) {
    switch (msg.t) {
      case "state":
        this.onState(msg.state);
        break;
      case "sentence-start":
        this.playback.onSentenceStart(msg.start);
        break;
      case "settings-changed":
        void this.reloadSettings().then(() => {
          this.playback.restyle();
          this.refresh();
          this.reader?.apply();
        });
        break;
      case "toast":
        this.toast(msg);
        break;
      case "reader":
        if (msg.open) this.session.open();
        else this.session.close();
        break;
    }
  }

  private toast(msg: Extract<BgToContent, { t: "toast" }>) {
    const act = msg.action;
    this.ensureUi().toast(
      msg.message,
      msg.kind ?? "ok",
      act ? { label: msg.actionLabel ?? "View queue", run: () => this.post({ t: act === "open-sidepanel" ? "open-sidepanel" : "open-options" }) } : undefined,
    );
  }

  /** Reply to a background 'extract' request. */
  extractReply(mode: ReadMode) {
    return this.docsPart.extractReply(mode);
  }
  openReader() {
    this.session.open();
  }
  closeReader() {
    this.session.close();
  }
}

let instance: Promise<Controller> | null = null;
export const boot = (): Promise<Controller> =>
  (instance ??= (async () => {
    const c = new Controller();
    await c.init();
    return c;
  })());
