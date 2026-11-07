/// <reference types="chrome" />
import { SETTINGS_KEY, type BgToContent, type ContentToBg, type PlayerCommand, type PlayerState, type ReadDoc, type SiteRule } from "@speakkit/protocol";
import type { ReaderView } from "../../features/reader";
import { defaultSettings, siteRule, type Settings } from "../../features/settings";
import type { ExtraToBg, VoiceInfo } from "../../shared/internal";
import type { UiModel } from "../../shared/ui-types";
import type { Ctx, Current, Doc, ReadMode } from "./context";
import { OPEN, reduceTabUi, type TabUi, type TabUiEvent } from "./dismiss";
import { Docs } from "./docs";
import { EngineWake, loadSettings, saveSettings } from "./bridge";
import { Follow, Playback } from "./playback";
import { makeHandlers } from "./handlers";
import { PageInput } from "./input";
import { defer, loadUi, type Deferred } from "./lazy";
import { ACTIVE, asHello } from "./player-state";
import { PlayerView } from "./player-view";
import { ReaderSession } from "./reader-session";
import type { Ui } from "./ui";

/** The lazy half of the content script: settings, extraction, highlight and the Shadow DOM UI. Loaded by index.ts. */

/** The page address without its fragment: moving to #section is not a new page. */
const pageKey = () => location.href.replace(/#.*/, "");

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
  private tabUi: TabUi = OPEN;
  private pageUrl = pageKey();
  /** A sub-frame holds text to read and highlights it, but has no page UI, input handling or handshake: those belong to the top frame. */
  readonly frame = window !== window.top;
  private gone = false;
  private onGone: () => void = () => {};

  private readonly ac = new AbortController();
  private readonly view = new PlayerView(this);
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
    if (!this.frame) this.input.listen(signal);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.refresh(), { signal });
    // same-document navigation (pushState, back/forward in a single-page app): the new page starts without the old reading
    (globalThis as { navigation?: EventTarget }).navigation?.addEventListener("currententrychange", () => this.onNavigate(), { signal });
    addEventListener("pageshow", (e) => e.persisted && this.hello(), { signal });
    this.playback.restyle();
    this.refresh();
    if (!this.frame) this.hello();
  }

  /** Handshake with the worker: it tells this page whether its tab was closed and whether a reading of this very document is running (UI enabled mid-reading, page restored from the back/forward cache). */
  private hello() {
    this.post({ t: "hello", url: location.href }, (r) => {
      const h = asHello(r);
      if (!h) return;
      if (h.dismissed && !this.dismissed) this.closeLocal();
      if (h.state && !this.state) this.onState(h.state);
      this.refresh();
    });
  }

  private onNavigate() {
    if (this.gone || pageKey() === this.pageUrl) return;
    this.pageUrl = pageKey();
    this.session.close();
    this.playback.stopHighlight();
    this.state = null;
    this.docs.clear();
    this.docsPart.reset();
    this.lastDoc = null;
    this.engaged = false;
    this.view.reset();
    this.ui?.showGutter(null);
    this.ui?.hideBubble();
    this.refresh();
  }

  alive() {
    if (this.gone) return false;
    if (chrome.runtime?.id) return true;
    this.teardown();
    return false;
  }

  /** The extension was reloaded or updated under this page: remove every listener and element, quietly. */
  private teardown() {
    this.gone = true;
    this.ac.abort();
    this.session.close();
    this.playback.stopHighlight();
    this.follow.sync();
    this.ui?.destroy();
    this.ui = null;
    this.onGone();
  }

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
  onceGone(cb: () => void) {
    this.onGone = cb;
  }

  get dismissed() {
    return this.tabUi.dismissed;
  }
  private tabEvent(e: TabUiEvent) {
    this.tabUi = reduceTabUi(this.tabUi, e);
    if (window.__speakkitContent) window.__speakkitContent.closed = this.tabUi.dismissed; // read by the popup's probe, which runs in this world
  }

  /** The close button: the worker stops this tab's reading and remembers the flag; the page clears itself at once. */
  closeTab() {
    this.post({ t: "dismiss", on: true });
    this.closeLocal();
  }
  /** Clears the page and hides every surface of this tab. */
  private closeLocal() {
    const st = this.state;
    this.tabEvent({ t: "close", docId: st?.docId });
    this.session.close();
    this.playback.stopHighlight();
    if (st) this.state = { ...st, status: "idle" };
    this.ui?.closePop();
    this.ui?.showGutter(null);
    this.ui?.hideBubble();
    this.refresh();
  }
  /** Reading was asked for (shortcut, menu, popup, icon, reader): the surfaces return. */
  restoreTab() {
    if (!this.tabUi.dismissed) return;
    this.tabEvent({ t: "restore" });
    this.post({ t: "dismiss", on: false });
    this.refresh();
  }
  showTab() {
    this.restoreTab();
    return true;
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

  /** Which surfaces the settings and the site rule allow. */
  private surfaces(rule: SiteRule | undefined) {
    const s = this.settings;
    const off = rule === "hide-controls" || rule === "never-read" || this.dismissed;
    return {
      showDock: s.show.dock && !off,
      alwaysDock: rule === "always-dock" && !this.dismissed,
      launcher: s.launcher.enabled && !off ? s.launcher : null,
      showBubble: s.show.bubble && !off,
      showGutter: s.show.gutter && !off && this.engaged,
    };
  }

  model(): UiModel {
    const rule = this.rule();
    const st = rule === "never-read" || this.dismissed ? null : this.state;
    return {
      ...this.view.of(st),
      ...this.surfaces(rule),
      dark: this.playback.dark,
      engineAsleep: this.wake.asleep && (st?.status ?? "idle") === "idle",
      readerOpen: !!this.reader,
      dismissed: this.dismissed,
    };
  }

  private wantsUi(m: UiModel) {
    return !!m.launcher || m.alwaysDock || m.showBubble || m.showGutter || (m.showDock && m.status !== "idle") || m.status === "error";
  }

  /** Create the UI on demand and push the current model. */
  refresh() {
    if (this.gone || this.frame) return;
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

  post(msg: ContentToBg | ExtraToBg, cb?: (r: unknown) => void) {
    if (!this.alive()) return;
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
    this.tabEvent({ t: "state", active: ACTIVE.includes(st.status), docId: st.docId });
    if (this.dismissed) return; // the reading we closed is still winding down
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
      case "dismissed":
        if (msg.on) this.closeLocal();
        else this.restoreTab();
        break;
      case "reader":
        if (msg.open) {
          this.restoreTab();
          this.session.open();
        } else this.session.close();
        break;
    }
  }

  private toast(msg: Extract<BgToContent, { t: "toast" }>) {
    if (this.dismissed) return;
    const act = msg.action;
    this.ensureUi().toast(
      msg.message,
      msg.kind ?? "ok",
      act ? { label: msg.actionLabel ?? "View queue", run: () => this.post({ t: act === "open-sidepanel" ? "open-sidepanel" : "open-options" }) } : undefined,
    );
  }

  /** Reply to a background 'extract' request. */
  extractReply(mode: ReadMode) {
    this.restoreTab();
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
export const boot = (onGone: () => void = () => {}): Promise<Controller> =>
  (instance ??= (async () => {
    const c = new Controller();
    c.onceGone(onGone);
    await c.init();
    return c;
  })().catch((e) => {
    instance = null; // a failed start can be retried by the next message
    throw e;
  }));
