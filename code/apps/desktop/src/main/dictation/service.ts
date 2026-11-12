import { powerMonitor, powerSaveBlocker, type WebContents } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AudioStore, Dictation, DictationState } from "@speakkit/dictation";
import { STATUS_EVENT } from "../../shared/dictation/channels";
import { SPEECH_MODELS_EVENT } from "../../shared/speech-models/channels";
import type { SpeechModels } from "../speech-models/service";
import { createSpeechParts, startSpeech } from "../speech-models/wiring";
import type { DictationStatus, RecorderEvent } from "../../shared/dictation/contract";
import type { DictationServiceOptions } from "./service-options";
import { filePickers, type HistoryApi } from "./history-api";
import type { DictationConfig, DictationModelId, DictationPatch } from "../../shared/dictation/settings";
import type { Ctx } from "../context";
import { createHotkeys, type SwitchableHotkeys } from "./hotkey-source";
import { createPresenter, type HudPresenter } from "./hud-presenter";
import { createDictationOs, type DictationOs, type HudWindow, type InsertResult } from "./index";
import { settle, supportsLanguage, type ModelManager } from "./models";
import { resyncOnPower } from "./power-resync";
import type { RecorderHost } from "./recorder";
import { appOverrides, clock, coreSettings, dictationStatus, hotkeyLayout, isRecording, shortcutClash, shouldRetryHotkey, touchesMicrophone, windowShown } from "./service-support";
import { createParts, type Failure, type Parts } from "./service-parts";
import { buildCore } from "./service-core";
import { MicState } from "./mic-state";
import { createThrottle } from "./throttle";
import { createSleepBlock } from "./sleep-block";
import type { Stt } from "./stt";
import { fakeStt, type FakeStt } from "./stt-fake";

export type { DictationServiceOptions } from "./service-options";

const PUSH_MS = 200;
/**
 * Dictation in the desktop app: the key hook, the microphone window, the speech engine, the HUD and the history, wired to the core and shown to
 * the Settings pages. Nothing runs (no hook, no microphone window, no model in memory) until the person turns dictation on.
 */
export class DictationService {
  readonly #ctx: Ctx;
  readonly #o: DictationServiceOptions;
  readonly #onChange: () => void;
  readonly stt: Stt;
  readonly fake: FakeStt | undefined;
  readonly models: ModelManager;
  readonly speech: SpeechModels;
  readonly presenter: HudPresenter;
  readonly controls: Parts["controls"];
  readonly history: Parts["history"];
  /** What the History page and the vocabulary files need beyond the count and the recent texts. */
  readonly records: HistoryApi;
  readonly #failure: Failure = { clip: undefined, error: "", replay: undefined };
  /** The buttons that act on the last dictation or the HUD: retry, open the sound settings, press a HUD button. */
  readonly actions: Parts["actions"];
  readonly ready: Promise<void>;
  /** Tests only: the microphone window refuses the microphone while this is set. */
  micDenied = false;
  os: DictationOs | undefined;
  core: Dictation | undefined;
  state: DictationState = { status: "idle" };
  #hotkeys: SwitchableHotkeys | undefined;
  #recorder: RecorderHost | undefined;
  #hudWindow: HudWindow | undefined;
  #hotkeyFailed = false;
  readonly mic = new MicState(process.platform === "win32", () => this.#recorder, { enabled: () => this.#cfg.enabled, windowShown: () => windowShown(this.#o.parent()), after: clock.after });
  readonly #sleep = createSleepBlock(
    powerSaveBlocker,
    () => this.#cfg.blockSleep,
    (why) => this.#ctx.log.warn("dictation sleep block", why),
  );
  #audio: AudioStore | undefined;
  /** Tests only: what the scripted writer does with the next dictation. */
  fakeRewrite: "ok" | "hang" | "fail" = "ok";
  /** Tests only: the files the pickers return (null is a cancelled dialog). */
  readonly scriptedFiles: { open: string | null; save: string | null } = { open: null, save: null };
  #lastInsert: InsertResult | undefined;
  #rejected: DictationStatus["rejected"];
  readonly #throttle = createThrottle(() => this.#send(), PUSH_MS);
  #stopPower: (() => void) | undefined;
  #stopSpeech: (() => void) | undefined;

  constructor(ctx: Ctx, o: DictationServiceOptions, onChange: () => void) {
    this.#ctx = ctx;
    this.#o = o;
    this.#onChange = onChange;
    // SPEAKKIT_REAL_STT keeps the real engine in a test run (a manual check against the models on this computer).
    this.fake = __TEST_CODE__ && o.test && !o.stt && !process.env.SPEAKKIT_REAL_STT ? fakeStt() : undefined;
    const sp = createSpeechParts({ ctx, o, stt: o.stt ?? this.fake, svc: this, select: (id) => this.#choose(id), push: (soon) => this.#push(soon) });
    [this.stt, this.models, this.speech] = [sp.stt, sp.models, sp.speech];
    this.presenter = createPresenter({ os: () => this.os, cfg: () => this.#cfg, failure: this.#failure, lastInsert: () => this.#lastInsert });
    const parts = createParts({
      ready: () => this.ready,
      failure: this.#failure,
      presenter: this.presenter,
      core: () => this.core,
      hotkeys: () => this.#hotkeys,
      state: () => this.state,
      foreground: () => this.os?.foreground() ?? null,
      rules: () => (this.#cfg.enabled ? this.#cfg.pauseRules : undefined),
      changed: () => this.#push(true),
      download: () => this.#downloadFromHud(),
      audio: () => this.#audio,
      cfg: () => this.#cfg,
      stt: this.stt,
      catalog: () => this.speech.catalog(),
      files: o.files ?? filePickers(o.parent, __TEST_CODE__ && o.test ? this.scriptedFiles : undefined),
      warn: (title, detail) => this.#ctx.log.warn(title, detail),
      key: o,
    });
    ({ controls: this.controls, history: this.history, records: this.records, actions: this.actions } = parts);
    // No key hook was ever built when this fails: turning dictation on cannot work either.
    this.ready = this.#init().catch((e) => {
      this.#ctx.log.error("dictation could not start", String(e));
      this.#hotkeyFailed = true;
    });
  }

  get #cfg(): DictationConfig {
    return this.#ctx.config.dictation;
  }
  get supported(): boolean {
    return this.os?.supported ?? (process.platform === "win32" || process.platform === "darwin");
  }

  async #init(): Promise<void> {
    const page = (name: string) => pathToFileURL(path.join(this.#o.distDir, "../renderer", name)).href;
    const os = (this.os =
      this.#o.os ??
      (await createDictationOs({
        overrides: () => appOverrides(this.#cfg.appRules),
        hud: { page: page("hud.html"), width: 560, height: 64, bridge: true },
        onHudWindow: (w) => (this.#hudWindow = w),
      })));
    this.#stopPower = resyncOnPower(powerMonitor, () => this.resync());
    this.#hotkeys = createHotkeys({ os: os.hotkey, now: clock.now, onFault: (e, recovered) => this.#onHookFault(e, recovered), changed: () => this.#push(true) });
    this.#hotkeys.onPasteLast(() => void this.controls.pasteLast());
    const built = buildCore({
      ctx: this.#ctx,
      o: this.#o,
      svc: this,
      failure: this.#failure,
      os,
      hotkeys: this.#hotkeys,
      page,
      onMicEvent: (e) => this.#onMicEvent(e),
      inserted: (r) => (this.#lastInsert = r),
      onPromptDropped: () => this.records.setPromptDropped(true),
    });
    ({ recorder: this.#recorder, core: this.core, audio: this.#audio } = built);
    this.core.subscribe((s) => this.#onState(s));
    await this.core.ready();
    await this.models.refresh();
    await Promise.all([this.history.refresh(), this.records.refreshKey()]);
    this.#stopSpeech = startSpeech(this.speech, os, () => this.#cfg.enabled);
    if (this.#cfg.enabled) await this.#enable(true, true);
  }

  #onState(s: DictationState): void {
    if (isRecording(this.state) && !isRecording(s)) this.speech.recordingEnded();
    this.state = s;
    // Escape cancels a toggled recording only; in a held or locked one it belongs to the app in front.
    this.#hotkeys?.setCancelGrab(s.status === "recording" && s.mode === "toggle");
    if (s.status === "error") this.#failure.error = s.code;
    this.#sleep(s.status === "recording" || s.status === "locked");
    if (s.status === "idle" && s.notice) void this.history.refresh();
    this.presenter.onState(s);
    this.#push(true);
  }

  // ---- status ------------------------------------------------------------------------------------------------

  status(): DictationStatus {
    return dictationStatus({
      supported: this.supported,
      config: this.#cfg,
      hotkeyReady: this.#hotkeys?.active ?? false,
      hotkeyFailed: this.#hotkeyFailed,
      state: this.state,
      models: this.models,
      historyCount: this.history.count,
      notes: this.records.parts(),
      paused: this.controls.paused,
      mouseButtons: this.os?.hotkey.mouse === true,
      readerShortcuts: { ...this.#ctx.config.shortcuts },
      rejected: this.#rejected,
      micOwner: this.#o.micOwner?.(),
      mic: this.mic.status,
      devices: this.mic.devices,
    });
  }

  #onMicEvent(e: RecorderEvent): void {
    const { changed, silent } = this.mic.handle(e);
    if (silent) this.#failure.error = "mic-silent";
    if (changed) this.#push(true);
  }

  #send(): void {
    const contents = this.#o.parent()?.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.send(STATUS_EVENT, this.status());
      contents.send(SPEECH_MODELS_EVENT, this.speech.view());
    }
    this.#onChange();
  }

  /** Download progress arrives many times a second; the window gets a few updates a second. */
  #push = (soon = false): void => this.#throttle.push(soon);

  // ---- settings, enabling, models ----------------------------------------------------------------------------

  #choose(id: DictationModelId): void {
    this.#cfg.model = id;
    if (!supportsLanguage(id, this.#cfg.language, this.speech.catalog())) this.#cfg.language = "en";
    this.#ctx.saveConfig();
  }

  async patchSettings(patch: DictationPatch): Promise<DictationStatus> {
    await this.ready;
    const { model, ...rest } = patch;
    // A shortcut another one already uses is refused before anything is saved; the page shows which one.
    this.#rejected = shortcutClash(this.#cfg, rest, this.#ctx.config.shortcuts);
    if (this.#rejected) return this.status();
    Object.assign(this.#cfg, rest);
    delete this.#cfg.resetNotice; // any change dismisses the notice about a reset shortcut
    if (model || patch.prompt !== undefined || patch.terms) this.records.setPromptDropped(false);
    if (model && model !== this.#cfg.model) await this.models.switchTo(model); // only an installed model can be chosen
    if (!supportsLanguage(this.#cfg.model, this.#cfg.language, this.speech.catalog())) this.#cfg.language = "en";
    this.#ctx.saveConfig();
    this.core?.configure(coreSettings(this.#cfg));
    this.#hotkeys?.layout(hotkeyLayout(this.#cfg));
    this.controls.watch();
    if (patch.retention !== undefined) void this.history.refresh();
    if (this.#cfg.enabled && touchesMicrophone(patch)) void this.mic.refresh();
    this.#push(true);
    return this.status();
  }

  #onHookFault(e: unknown, recovered: boolean): void {
    this.#ctx.log.warn("dictation hook failed", `${String(e)} (${recovered ? "reinstalled" : "not reinstalled"})`);
    if (!this.#cfg.enabled) return; // switched off meanwhile: nothing to report
    this.#setHotkeyFailed(!recovered);
  }

  #setHotkeyFailed(failed: boolean): void {
    this.#hotkeyFailed = failed;
    if (failed) this.presenter.alert("hotkey-failed");
    this.#push(true);
  }

  /** Starts the hotkey again after what blocked it was fixed (a permission was allowed). */
  async retryHotkey(permitted: boolean): Promise<void> {
    await this.ready;
    if (shouldRetryHotkey({ failed: this.#hotkeyFailed, enabled: this.#cfg.enabled, permitted })) await this.#start(false);
  }

  async setEnabled(on: boolean): Promise<DictationStatus> {
    await this.ready;
    if (on && !this.supported) return this.status();
    if (on && !this.core) {
      // The key hook could not be built at start-up: saying "on" would only save a setting that does nothing.
      this.#setHotkeyFailed(true);
      return this.status();
    }
    this.#cfg.enabled = on;
    this.#ctx.saveConfig();
    await this.#enable(on, false);
    return this.status();
  }

  async #enable(on: boolean, quiet: boolean): Promise<void> {
    if (!this.core || !this.#hotkeys) return;
    if (on) await this.#start(quiet);
    else await this.#stop();
    this.#push(true);
  }

  async #start(quiet: boolean): Promise<void> {
    if (!this.supported || !this.core || !this.#hotkeys) return;
    this.core.configure(coreSettings(this.#cfg));
    this.#hotkeys.layout(hotkeyLayout(this.#cfg));
    const ready = this.#hotkeys.enable(true);
    this.controls.watch();
    this.#setHotkeyFailed(!ready);
    void this.#recorder?.prepare().then(() => this.mic.refresh());
    await this.models.refresh();
    // At launch (quiet) with release-when-idle on, the model stays on disk: the first dictation loads it (the page says that takes longer).
    if (this.models.installed) {
      if (!quiet || this.#ctx.config.engines.idleMinutes === 0) this.models.warm();
    } else if (!this.#ctx.config.engines.skippedModel) void this.models.download(this.#cfg.model);
    if (!quiet && ready) this.presenter.flashReady();
  }

  async #stop(): Promise<void> {
    this.core?.cancel();
    this.#hotkeys?.enable(false);
    this.controls.watch();
    this.#setHotkeyFailed(false);
    this.#recorder?.close();
    this.mic.reset();
    this.presenter.dismiss();
    this.os?.hud.dispose(); // the HUD window goes now; the next recording makes a new one
    await this.models.unload();
  }

  async download(id: DictationModelId): Promise<DictationStatus> {
    await this.ready;
    await this.models.download(id);
    return this.status();
  }

  async cancelDownload(): Promise<DictationStatus> {
    await this.models.cancel();
    return this.status();
  }

  // ---- history, retry, HUD buttons ---------------------------------------------------------------------------

  /** True when `contents` is the HUD page: only it may press the HUD buttons. */
  ownsHud = (contents: WebContents): boolean => !!this.#hudWindow?.owns?.(contents);

  #downloadFromHud(): void {
    this.#ctx.showWindow();
    this.#ctx.sendUi({ type: "nav", page: "dictation" });
    void this.download(this.#cfg.model);
  }

  /** Key releases may have gone to another desktop while the screen was locked or the computer slept. */
  resync(): void {
    this.os?.hotkey.resync();
    this.presenter.reconnected();
  }

  toggle(): void {
    void this.setEnabled(!this.#cfg.enabled);
  }

  async dispose(): Promise<void> {
    this.#stopSpeech?.();
    this.speech.dispose();
    this.#throttle.dispose();
    this.#sleep(false);
    this.controls.dispose();
    this.#hotkeys?.dispose();
    this.#stopPower?.();
    this.presenter.dispose();
    await this.ready;
    this.core?.dispose();
    this.#hotkeys?.enable(false);
    this.#recorder?.dispose();
    await this.os?.dispose();
    await settle(this.stt.unload());
  }
}
