import { ipcMain, powerMonitor, shell, type BrowserWindow, type WebContents } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDictation, type Clip, type Dictation, type DictationState } from "@speakkit/dictation";
import { WhisperStt } from "@speakkit/engine";
import { STATUS_EVENT, type HudAction } from "../../shared/dictation/channels";
import type { DictationStatus, HistoryItem } from "../../shared/dictation/contract";
import type { DictationConfig, DictationModelId, DictationPatch } from "../../shared/dictation/settings";
import type { Ctx } from "../context";
import { createHotkeys, type SwitchableHotkeys } from "./hotkey-source";
import { createHistoryStorage } from "./history-storage";
import { HudPresenter } from "./hud-presenter";
import { createDictationOs, type DictationOs, type HudWindow, type InsertResult } from "./index";
import { ModelManager, settle, supportsLanguage } from "./models";
import { createInserterPort, ReplayRecorder } from "./ports";
import { resyncOnPower } from "./power-resync";
import { createRecorderHost, type RecorderHost } from "./recorder";
import { clock, coreSettings, dictationStatus, shouldRetryHotkey, soundSettingsUrl } from "./service-support";
import { openRecorderWindow } from "./recorder-window";
import { createTranscriber, type Stt } from "./stt";
import { fakeStt, type FakeStt } from "./stt-fake";

export interface DictationServiceOptions {
  dataDir: string;
  modelsDir: string;
  /** Directory of the bundled main-process files; the renderer pages sit in ../renderer. */
  distDir: string;
  /** The speech worker file (dist/worker/stt-worker.js when built, the source file in development). */
  sttWorker: URL;
  parent(): BrowserWindow | null;
  /** The test hook is on: a scripted speech engine replaces the real one and the microphone can be refused. */
  test: boolean;
  /** Tests only. */
  os?: DictationOs;
  stt?: Stt;
}

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
  readonly presenter: HudPresenter;
  readonly ready: Promise<void>;
  /** Tests only: the microphone window refuses the microphone while this is set. */
  micDenied = false;
  os: DictationOs | undefined;
  core: Dictation | undefined;
  state: DictationState = { status: "idle" };
  #hotkeys: SwitchableHotkeys | undefined;
  #recorder: RecorderHost | undefined;
  #replay: ReplayRecorder | undefined;
  #hudWindow: HudWindow | undefined;
  #hotkeyFailed = false;
  #count = 0;
  #lastInsert: InsertResult | undefined;
  #lastFailed: Clip | undefined;
  #lastError = "";
  #lastPush = 0;
  #pushTimer: NodeJS.Timeout | undefined;
  #stopPower: (() => void) | undefined;

  constructor(ctx: Ctx, o: DictationServiceOptions, onChange: () => void) {
    this.#ctx = ctx;
    this.#o = o;
    this.#onChange = onChange;
    // SPEAKKIT_REAL_STT keeps the real engine in a test run (a manual check against the models on this computer).
    this.fake = __TEST_CODE__ && o.test && !o.stt && !process.env.SPEAKKIT_REAL_STT ? fakeStt() : undefined;
    this.stt = o.stt ?? this.fake ?? new WhisperStt({ modelsDir: o.modelsDir, workerUrl: o.sttWorker });
    this.models = new ModelManager({
      stt: this.stt,
      selected: () => this.#cfg.model,
      select: (id) => this.#choose(id),
      changed: (soon) => this.#push(soon),
    });
    this.presenter = new HudPresenter({
      hud: () => this.os?.hud,
      hotkey: () => this.#cfg.hotkey,
      canRetry: () => !!this.#lastFailed,
      insertedAsCopy: () => this.#lastInsert?.status === "copied",
      secureInput: () => this.#lastInsert?.status === "copied" && this.#lastInsert.reason === "secure-input",
    });
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
    const os = (this.os = this.#o.os ?? (await createDictationOs({ hud: { page: page("hud.html"), width: 560, height: 64, bridge: true }, onHudWindow: (w) => (this.#hudWindow = w) })));
    this.#stopPower = resyncOnPower(powerMonitor, () => this.resync());
    this.#hotkeys = createHotkeys({ os: os.hotkey, now: clock.now, onFault: (e, recovered) => this.#onHookFault(e, recovered) });
    this.#recorder = createRecorderHost({
      ipcMain,
      onLevel: (n) => this.presenter.setLevel(n),
      open: () => {
        const w = openRecorderWindow({ page: page("recorder.html"), micAllowed: () => !this.micDenied });
        return {
          contents: w.webContents,
          destroy: () => !w.isDestroyed() && w.destroy(),
          get destroyed() {
            return w.isDestroyed();
          },
        };
      },
    });
    this.#replay = new ReplayRecorder(this.#recorder);
    this.core = createDictation({
      clock,
      recorder: this.#replay,
      transcriber: createTranscriber({ stt: this.stt, model: () => this.#cfg.model, onFailedClip: (c) => (this.#lastFailed = c), onModelError: (d) => this.models.report(d) }),
      inserter: createInserterPort(os, (r) => (this.#lastInsert = r)),
      hotkeys: this.#hotkeys,
      storage: createHistoryStorage(path.join(this.#o.dataDir, "dictation-history.json")),
      settings: coreSettings(this.#cfg),
    });
    this.core.subscribe((s) => this.#onState(s));
    await this.core.ready();
    await this.models.refresh();
    await this.#refreshCount();
    if (this.#cfg.enabled) await this.#enable(true, true);
  }

  #onState(s: DictationState): void {
    this.state = s;
    // Escape cancels a toggled recording only; in a held or locked one it belongs to the app in front.
    this.#hotkeys?.setCancelGrab(s.status === "recording" && s.mode === "toggle");
    if (s.status === "error") this.#lastError = s.code;
    if (s.status === "idle" && s.notice) void this.#refreshCount();
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
      historyCount: this.#count,
    });
  }

  #send(): void {
    clearTimeout(this.#pushTimer);
    this.#pushTimer = undefined;
    this.#lastPush = Date.now();
    const contents = this.#o.parent()?.webContents;
    if (contents && !contents.isDestroyed()) contents.send(STATUS_EVENT, this.status());
    this.#onChange();
  }

  /** Download progress arrives many times a second; the window gets a few updates a second. */
  #push(soon = false): void {
    if (soon || Date.now() - this.#lastPush >= PUSH_MS) this.#send();
    else this.#pushTimer ??= setTimeout(() => this.#send(), PUSH_MS);
  }

  async #refreshCount(): Promise<void> {
    this.#count = ((await this.core?.history.list().catch(() => [])) ?? []).length;
    this.#push(true);
  }

  // ---- settings, enabling, models ----------------------------------------------------------------------------

  #choose(id: DictationModelId): void {
    this.#cfg.model = id;
    if (!supportsLanguage(id, this.#cfg.language)) this.#cfg.language = "auto";
    this.#ctx.saveConfig();
  }

  async patchSettings(patch: DictationPatch): Promise<DictationStatus> {
    await this.ready;
    const { model, ...rest } = patch;
    Object.assign(this.#cfg, rest);
    if (model && model !== this.#cfg.model) await this.models.switchTo(model); // only an installed model can be chosen
    if (!supportsLanguage(this.#cfg.model, this.#cfg.language)) this.#cfg.language = "auto";
    this.#ctx.saveConfig();
    this.core?.configure(coreSettings(this.#cfg));
    this.#hotkeys?.setHotkey(this.#cfg.hotkey);
    if (patch.retention !== undefined) void this.#refreshCount();
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
    this.#hotkeys.setHotkey(this.#cfg.hotkey);
    const ready = this.#hotkeys.enable(true);
    this.#setHotkeyFailed(!ready);
    void this.#recorder?.prepare();
    await this.models.refresh();
    if (this.models.installed) this.models.warm();
    else void this.models.download(this.#cfg.model);
    if (!quiet && ready) this.presenter.flashReady();
  }

  async #stop(): Promise<void> {
    this.core?.cancel();
    this.#hotkeys?.enable(false);
    this.#setHotkeyFailed(false);
    this.#recorder?.close();
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

  async historyList(search?: string): Promise<HistoryItem[]> {
    await this.ready;
    const items = (await this.core?.history.list(search ? { search } : undefined)) ?? [];
    return items.map((e) => ({ id: e.id, at: e.at, text: e.text, ...(e.app && { app: e.app }) }));
  }

  async historyCopy(id: string): Promise<boolean> {
    await this.ready;
    return (await this.core?.history.copy(id)) ?? false;
  }

  async historyRemove(id: string): Promise<void> {
    await this.ready;
    await this.core?.history.remove(id);
    await this.#refreshCount();
  }

  async historyClear(): Promise<void> {
    await this.ready;
    await this.core?.history.clear();
    await this.#refreshCount();
  }

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
    const url = soundSettingsUrl(process.platform, this.#lastError === "mic-denied" || this.#lastError === "mic-silent");
    if (url) await shell.openExternal(url);
  }

  /** True when `contents` is the HUD page: only it may press the HUD buttons. */
  ownsHud(contents: WebContents): boolean {
    return !!this.#hudWindow?.owns?.(contents);
  }

  hudAction(a: HudAction): void {
    this.presenter.dismiss();
    if (a === "retry") void this.retry();
    else if (a === "download") {
      this.#ctx.showWindow();
      this.#ctx.sendUi({ type: "nav", page: "settings", sub: "dictation" });
      void this.download(this.#cfg.model);
    } else if (a === "sound-settings") void this.openSoundSettings();
  }

  /** Key releases may have gone to another desktop while the screen was locked or the computer slept. */
  resync(): void {
    this.os?.hotkey.resync();
  }

  toggle(): void {
    void this.setEnabled(!this.#cfg.enabled);
  }

  async dispose(): Promise<void> {
    clearTimeout(this.#pushTimer);
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
