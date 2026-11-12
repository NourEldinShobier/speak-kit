import { powerMonitor, powerSaveBlocker, systemPreferences, type WebContents } from "electron";
import { reduceMotion } from "../../shared/settings/behaviour";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDictation, type Clip, type Dictation, type DictationState } from "@speakkit/dictation";
import { STATUS_EVENT, type HudAction } from "../../shared/dictation/channels";
import { SPEECH_MODELS_EVENT } from "../../shared/speech-models/channels";
import type { SpeechModels } from "../speech-models/service";
import { createSpeechParts, startSpeech } from "../speech-models/wiring";
import type { DictationStatus } from "../../shared/dictation/contract";
import type { DictationConfig, DictationModelId, DictationPatch } from "../../shared/dictation/settings";
import type { Ctx } from "../context";
import { HistoryApi } from "./history-api";
import { createHotkeys, type SwitchableHotkeys } from "./hotkey-source";
import { HudPresenter } from "./hud-presenter";
import { createDictationOs, type DictationOs, type HudWindow, type InsertResult } from "./index";
import { ModelManager, settle, supportsLanguage } from "./models";
import { createInserterPort, ReplayRecorder } from "./ports";
import { resyncOnPower } from "./power-resync";
import { createRecorderHost, type RecorderHost } from "./recorder";
import { clock, coreSettings, dictationStatus, isRecording, Throttle } from "./service-support";
import { openRecorderWindow } from "./recorder-window";
import { createTranscriber, type Stt } from "./stt";
import { fakeStt, type FakeStt } from "./stt-fake";

export type { DictationServiceOptions } from "./service-options";

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
  readonly history = new HistoryApi({ core: () => this.core, ready: () => this.ready, catalog: () => this.speech.catalog(), changed: () => this.#push(true) });
  readonly presenter: HudPresenter;
  readonly history: HistoryApi;
  readonly ready: Promise<void>;
  readonly history = new HistoryFacade({ core: () => this.core, ready: () => this.ready, changed: () => this.#push(true) });
  /** Tests only: the microphone window refuses the microphone while this is set. */
  micDenied = false;
  os: DictationOs | undefined;
  core: Dictation | undefined;
  state: DictationState = { status: "idle" };
  #hotkeys: SwitchableHotkeys | undefined;
  #recorder: RecorderHost | undefined;
  #hudWindow: HudWindow | undefined;
  #hotkeyFailed = false;
  #lastInsert: InsertResult | undefined;
  #lastFailed: Clip | undefined;
  #lastError = "";
  readonly #pusher = new Throttle(() => this.#send());
  #stopPower: (() => void) | undefined;
  #stopSpeech: (() => void) | undefined;

  constructor(ctx: Ctx, o: DictationServiceOptions, onChange: () => void) {
    this.#ctx = ctx;
    this.#o = o;
    this.#onChange = onChange;
    // SPEAKKIT_REAL_STT keeps the real engine in a test run (a manual check against the models on this computer).
    this.fake = __TEST_CODE__ && o.test && !o.stt && !process.env.SPEAKKIT_REAL_STT ? fakeStt() : undefined;
    const parts = createSpeechParts({
      ctx,
      o,
      stt: o.stt ?? this.fake,
      select: (id) => this.#choose(id),
      push: (soon) => this.#push(soon),
      supported: () => this.supported,
      recording: () => isRecording(this.state),
      configure: () => this.core?.configure(coreSettings(this.#cfg)),
    });
    ({ stt: this.stt, models: this.models, speech: this.speech } = parts);
    this.presenter = new HudPresenter({
      hud: () => this.os?.hud,
      hotkey: () => this.#cfg.hotkey,
      canRetry: () => !!this.#failure.clip,
      cancelLabel: () => keyLabel(this.#cfg.cancelKey === "Escape" ? "Esc" : this.#cfg.cancelKey),
      insertedAsCopy: () => this.#lastInsert?.status === "copied",
      secureInput: () => this.#lastInsert?.status === "copied" && this.#lastInsert.reason === "secure-input",
    });
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
      refreshCount: () => this.#refreshCount(),
      download: () => this.#downloadFromHud(),
    });
    ({ controls: this.controls, history: this.history } = parts);
    ({ retry: this.retry, openSoundSettings: this.openSoundSettings, hudAction: this.hudAction } = parts.actions);
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
    return this.os?.supported ?? process.platform === "win32";
  }
  get hotkeyActive(): boolean {
    return this.#hotkeys?.active ?? false;
  }

  async #init(): Promise<void> {
    const page = (name: string) => pathToFileURL(path.join(this.#o.distDir, "../renderer", name)).href;
    const os = (this.os =
      this.#o.os ??
      (await createDictationOs({
        overrides: () => appOverrides(this.#cfg.appRules),
        hud: { page: page("hud.html"), width: 560, height: 64, bridge: true, reduceMotion: () => this.#reduceMotion() },
        onHudWindow: (w) => (this.#hudWindow = w),
      })));
    this.#stopPower = resyncOnPower(powerMonitor, () => this.resync());
    this.#hotkeys = createHotkeys({ os: os.hotkey, now: clock.now, onFault: (e, recovered) => this.#onHookFault(e, recovered), changed: () => this.#push(true) });
    this.#hotkeys.onPasteLast(() => void this.controls.pasteLast());
    this.#recorder = createRecorderHost({
      ipcMain,
      onLevel: (n) => this.presenter.setLevel(n),
      open: () => recorderWindow(page("recorder.html"), () => !this.micDenied),
    });
    this.#replay = new ReplayRecorder(this.#recorder);
    const files = historyFiles(this.#o.dataDir, this.#o.trash ?? trashViaShell, (gone) => void this.core?.history.dropAudio(gone));
    this.#audio = files.audio;
    this.core = createDictation({
      clock,
      recorder: this.#replay,
      transcriber: createTranscriber({
        stt: this.stt,
        model: () => this.#cfg.model,
        models: () => this.speech.catalog(),
        onUsed: (id) => this.speech.used(id),
        onFailedClip: (c) => (this.#lastFailed = c),
        onModelError: (d) => this.models.report(d),
      }),
      inserter: createInserterPort(os, (r) => (this.#lastInsert = r)),
      hotkeys: this.#hotkeys,
      storage: files.storage,
      audio: files.audio,
      rewriter: this.#o.rewriter ?? (__TEST_CODE__ && this.#o.test ? scriptedRewriter(() => this.fakeRewrite) : createOpenAiRewriter({ readKey: async () => (await this.#o.readKey?.()) ?? null })),
      settings: coreSettings(this.#cfg),
      ...(this.#o.micOwner && { micOwner: this.#o.micOwner }),
    });
    this.core.subscribe((s) => this.#onState(s));
    await this.core.ready();
    await this.models.refresh();
    await this.history.refresh();
    this.#stopSpeech = startSpeech(
      this.speech,
      () => this.os?.foreground() ?? null,
      () => this.#cfg.enabled,
    );
    if (this.#cfg.enabled) await this.#enable(true, true);
  }

  /** The key can be saved or removed on the Voice chat page at any time. */
  async refreshKey(): Promise<void> {
    this.#hasKey = (await this.#o.hasKey?.()) ?? false;
  }

  #setPromptDropped(on: boolean): void {
    if (this.#promptDropped === on) return;
    this.#promptDropped = on;
    this.#push(true);
  }

  #onState(s: DictationState): void {
    if (isRecording(this.state) && !isRecording(s)) this.speech.recordingEnded();
    this.state = s;
    // Escape cancels a toggled recording only; in a held or locked one it belongs to the app in front.
    this.#hotkeys?.setCancelGrab(s.status === "recording" && s.mode === "toggle");
    if (s.status === "error") this.#lastError = s.code;
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
    });
  }

  #onMicEvent(e: RecorderEvent): void {
    const { changed, silent } = this.mic.handle(e);
    if (silent) this.#lastError = "mic-silent";
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
  #push(soon = false): void {
    this.#pusher.push(soon);
  }

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
    if (model || patch.prompt !== undefined || patch.terms) this.#promptDropped = false;
    if (model && model !== this.#cfg.model) await this.models.switchTo(model); // only an installed model can be chosen
    if (!supportsLanguage(this.#cfg.model, this.#cfg.language, this.speech.catalog())) this.#cfg.language = "en";
    this.#ctx.saveConfig();
    this.core?.configure(coreSettings(this.#cfg));
    this.#hotkeys?.setHotkey(this.#cfg.hotkey);
    if (patch.retention !== undefined) void this.history.refresh();
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

  /** Runs the last recording that could not be transcribed once more, through the same pipeline as a live one. */
  async retry(): Promise<void> {
    await this.ready;
    const clip = this.#lastFailed;
    if (!clip || !this.core || (this.state.status !== "idle" && this.state.status !== "error")) return;
    this.#lastFailed = undefined;
    this.#replay?.replay(clip);
    this.core.start();
    setTimeout(() => this.core?.stop(), 0);
  }

  async openSoundSettings(): Promise<void> {
    await shell.openExternal(soundSettingsUrl(this.#lastError === "mic-denied" || this.#lastError === "mic-silent"));
  }

  /** True when `contents` is the HUD page: only it may press the HUD buttons. */
  /** Reduce motion as the pill should show it: the app setting, else what the operating system asks. */
  #reduceMotion = (): boolean => reduceMotion(this.#ctx.config.reduceMotion, systemPreferences.getAnimationSettings().prefersReducedMotion) === "on";

  /** The Reduce motion setting changed. */
  motionChanged(): void {
    this.#hudWindow?.setReduceMotion?.(this.#reduceMotion());
  }

  ownsHud = (contents: WebContents): boolean => !!this.#hudWindow?.owns?.(contents);

  hudAction(a: HudAction): void {
    this.presenter.dismiss();
    if (a === "retry") void this.retry();
    else if (a === "download") {
      this.#ctx.showWindow();
      this.#ctx.sendUi({ type: "nav", page: "dictation" });
      void this.download(this.#cfg.model);
    } else if (a === "sound-settings") void this.openSoundSettings();
    else if (a === "restore") this.core?.restore();
    else if (a === "copy-last") void this.history.copyLast();
    else if (a === "paste-again") void this.history.pasteLast();
  }

  /** Key releases may have gone to another desktop while the screen was locked or the computer slept. */
  resync = (): void => this.os?.hotkey.resync();

  toggle(): void {
    void this.setEnabled(!this.#cfg.enabled);
  }

  async dispose(): Promise<void> {
    this.#stopSpeech?.();
    this.speech.dispose();
    this.#pusher.dispose();
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
