import { dialog, ipcMain, powerMonitor, shell, type BrowserWindow, type WebContents } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyMode, applyRules, createDictation, defaultSettings, resolveMode, soundsLikeRules, timeLeft, type AudioStore, type Clip, type Dictation, type DictationState, type HistoryHit, type Rewriter, type Settings } from "@speakkit/dictation";
import { WhisperStt } from "@speakkit/engine";
import { STATUS_EVENT, type HudAction } from "../../shared/dictation/channels";
import type { DictationStatus, HistoryItem } from "../../shared/dictation/contract";
import { createAudioStore, encodeWav } from "./audio-store";
import { createOpenAiRewriter } from "./openai-rewriter";
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
import { clock, coreSettings, dictationStatus } from "./service-support";
import { openRecorderWindow } from "./recorder-window";
import { createTranscriber, heard, type Stt } from "./stt";
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
  /** The saved OpenAI key, for the rewrite pass. */
  readKey?(): Promise<string | null>;
  hasKey?(): Promise<boolean>;
  /** Tests only. */
  os?: DictationOs;
  stt?: Stt;
  rewriter?: Rewriter;
  trash?(file: string): Promise<boolean>;
  /** Tests only: the file pickers, in place of the system dialogs. */
  files?: FilePickers;
}

export interface FilePickers {
  open(filters: { name: string; extensions: string[] }[]): Promise<string | null>;
  save(defaultName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>;
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
  #kept = 0;
  #promptDropped = false;
  #redo: DictationStatus["redo"];
  #redoAbort: AbortController | undefined;
  #hasKey = false;
  #audio: AudioStore | undefined;
  /** Tests only: what the scripted writer does with the next dictation. */
  fakeRewrite: "ok" | "hang" | "fail" = "ok";
  readonly #files: FilePickers;
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
    this.#files = o.files ?? {
      open: async (filters) => {
        const w = o.parent();
        const opts = { properties: ["openFile" as const], filters };
        const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
        return r.canceled ? null : (r.filePaths[0] ?? null);
      },
      save: async (defaultName, filters) => {
        const w = o.parent();
        const opts = { defaultPath: defaultName, filters };
        const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
        return r.canceled || !r.filePath ? null : r.filePath;
      },
    };
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
    return this.os?.supported ?? process.platform === "win32";
  }
  get hotkeyActive(): boolean {
    return this.#hotkeys?.active ?? false;
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
      transcriber: createTranscriber({ stt: this.stt, model: () => this.#cfg.model, onFailedClip: (c) => (this.#lastFailed = c), onModelError: (d) => this.models.report(d), onPromptDropped: () => this.#setPromptDropped(true) }),
      inserter: createInserterPort(os, (r) => (this.#lastInsert = r)),
      hotkeys: this.#hotkeys,
      storage: createHistoryStorage(path.join(this.#o.dataDir, "dictation-history.json")),
      audio: (this.#audio = createAudioStore({
        dir: path.join(this.#o.dataDir, "dictation-audio"),
        trash: this.#o.trash ?? ((f) => shell.trashItem(f).then(() => true, () => false)),
        onEvicted: (files) => void this.core?.history.dropAudio(files),
      })),
      rewriter: this.#o.rewriter ?? this.#writer(),
      settings: coreSettings(this.#cfg),
    });
    this.core.subscribe((s) => this.#onState(s));
    await this.core.ready();
    await this.models.refresh();
    await this.#refreshCount();
    this.#hasKey = (await this.#o.hasKey?.()) ?? false;
    if (this.#cfg.enabled) await this.#enable(true, true);
  }

  #writer(): Rewriter {
    if (__TEST_CODE__ && this.#o.test) {
      return {
        rewrite: ({ text, signal }) => {
          if (this.fakeRewrite === "fail") return Promise.reject(new Error("scripted"));
          if (this.fakeRewrite === "hang") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
          return Promise.resolve(`${text} [rewritten]`);
        },
      };
    }
    return createOpenAiRewriter({ readKey: async () => (await this.#o.readKey?.()) ?? null });
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
      hotkeyReady: this.hotkeyActive,
      hotkeyFailed: this.#hotkeyFailed,
      state: this.state,
      models: this.models,
      historyCount: this.#count,
      historyStatus: this.core?.history.status() ?? "ok",
      keptRecordings: this.#kept,
      rewriteKey: this.#hasKey || (__TEST_CODE__ && this.#o.test),
      promptDropped: this.#promptDropped,
      redo: this.#redo,
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
    if (model || patch.prompt !== undefined || patch.terms) this.#promptDropped = false;
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

  #item(e: HistoryHit, now: number): HistoryItem {
    const left = timeLeft(e, now, this.#cfg.retention);
    return {
      id: e.id,
      at: e.at,
      text: e.text,
      raw: e.raw,
      durationMs: e.durationMs,
      expiresInMs: Number.isFinite(left) ? left : null,
      ...(e.app && { app: e.app }),
      ...(e.model && { model: e.model }),
      ...(e.rewrite && { rewrite: e.rewrite }),
      ...(e.audio && { recording: true }),
      ...(e.audioRemoved && { recordingRemoved: true }),
      ...(e.versions && { versions: e.versions }),
      ...(e.version && { version: e.version }),
      ...(e.via && { via: e.via }),
    };
  }

  async historyList(search?: string): Promise<HistoryItem[]> {
    await this.ready;
    const items = (await this.core?.history.list(search ? { search } : undefined)) ?? [];
    const now = Date.now();
    return items.map((e) => this.#item(e, now));
  }

  async historyStats() {
    await this.ready;
    return (await this.core?.history.stats()) ?? { dictations: 0, words: 0, wordsPerMinute: 0, listeningMs: 0 };
  }

  async historyRecent(n: number): Promise<HistoryItem[]> {
    await this.ready;
    const now = Date.now();
    return ((await this.core?.history.recent(n)) ?? []).map((e) => this.#item(e, now));
  }

  async historyCopy(id: string): Promise<boolean> {
    await this.ready;
    return (await this.core?.history.copy(id)) ?? false;
  }

  #noteKept(kept: string[]): void {
    if (!kept.length) return;
    this.#kept += kept.length;
    this.#ctx.log.warn("dictation recording kept", `${kept.length} not moved to the Recycle Bin`);
    this.#push(true);
  }

  async historyRemove(id: string): Promise<void> {
    await this.ready;
    this.#noteKept((await this.core?.history.remove(id))?.kept ?? []);
    await this.#refreshCount();
  }

  async historyClear(): Promise<void> {
    await this.ready;
    this.#noteKept((await this.core?.history.clear())?.kept ?? []);
    await this.#refreshCount();
  }

  async historyDismissNotice(): Promise<void> {
    this.#kept = 0;
    this.#push(true);
  }

  async historyUseVersion(id: string, versionId: string): Promise<boolean> {
    await this.ready;
    const ok = (await this.core?.history.useVersion(id, versionId)) ?? false;
    this.#push(true);
    return ok;
  }

  async historyAudio(id: string): Promise<Uint8Array | null> {
    await this.ready;
    const clip = await this.core?.history.audio(id);
    return clip ? new Uint8Array(encodeWav(clip)) : null;
  }

  async historyDeleteRecording(id: string): Promise<void> {
    await this.ready;
    const file = (await this.core?.history.get(id))?.audio;
    if (!file || !this.#audio) return;
    if (await this.#audio.trash(file)) await this.core?.history.dropAudio([file]);
    else this.#noteKept([file]);
    this.#push(true);
  }

  async historyExport(): Promise<string | null> {
    await this.ready;
    const target = await this.#files.save("speakkit-history.json", [{ name: "JSON", extensions: ["json"] }]);
    if (!target) return null;
    const entries = (await this.core?.history.list()) ?? [];
    await writeFile(target, JSON.stringify({ version: 1, entries: entries.map(({ id, at, text, raw, app, model, durationMs }) => ({ id, at, text, raw, app, model, durationMs })) }, null, 2));
    return target;
  }

  async vocabImport() {
    const file = await this.#files.open([{ name: "Word lists", extensions: ["json", "txt", "csv"] }]);
    if (!file) return null;
    if ((await stat(file)).size > 2_000_000) throw new Error("too-large");
    const ext = path.extname(file).slice(1).toLowerCase();
    return { format: (ext === "txt" || ext === "csv" ? ext : "json") as "json" | "txt" | "csv", text: await readFile(file, "utf8"), name: path.basename(file) };
  }

  async vocabExport(format: "json" | "txt" | "csv", text: string): Promise<string | null> {
    const target = await this.#files.save(`speakkit-vocabulary.${format}`, [{ name: format.toUpperCase(), extensions: [format] }]);
    if (!target) return null;
    await writeFile(target, text, "utf8");
    return target;
  }

  #setRedo(redo: DictationStatus["redo"]): void {
    this.#redo = redo;
    this.#push(true);
  }

  /**
   * Transcribes a kept recording again with another (or the same) installed model and stores the result as a new version; the text in use does not
   * change until the person picks it. A model that is not installed, a recording that is gone and an engine failure each end in a visible failed state.
   */
  async historyRetranscribe(id: string, model: DictationModelId): Promise<void> {
    await this.ready;
    if (this.#redo?.state === "running" || !this.core) return;
    const fail = (error: "model-missing" | "failed" | "no-audio") => this.#setRedo({ id, model, state: "failed", error });
    this.#setRedo({ id, model, state: "running" });
    const abort = (this.#redoAbort = new AbortController());
    const cancelled = new Promise<"cancelled">((resolve) => abort.signal.addEventListener("abort", () => resolve("cancelled"), { once: true }));
    const selected = this.#cfg.model;
    try {
      const entry = await this.core.history.get(id);
      const clip = await this.core.history.audio(id);
      if (!entry || !clip) return fail("no-audio");
      if (!(await this.stt.downloaded(model))) return fail("model-missing");
      const started = Date.now();
      const language = supportsLanguage(model, this.#cfg.language) ? this.#cfg.language : "auto";
      const result = await Promise.race([
        (async () => {
          if (model !== selected) await this.stt.load(model);
          try {
            return await heard({ stt: this.stt, model: () => model, onFailedClip: () => undefined }, clip, language);
          } finally {
            if (model !== selected) await this.stt.load(selected).catch(() => undefined);
          }
        })(),
        cancelled,
      ]);
      if (result === "cancelled") return this.#setRedo(undefined);
      if (!result.ok || !result.text) return fail("failed");
      const base: Settings = { ...defaultSettings, ...coreSettings(this.#cfg) };
      const eff = applyMode(base, resolveMode(base.modes, entry.app));
      const text = applyRules(result.text, { ...eff, replacements: [...eff.replacements, ...soundsLikeRules(eff.terms)], language: result.language ?? this.#cfg.language });
      await this.core.history.addVersion(id, { model, at: Date.now(), text: text.trimEnd(), ms: Date.now() - started });
      this.#setRedo(undefined);
    } catch {
      fail("failed");
    } finally {
      if (this.#redoAbort === abort) this.#redoAbort = undefined;
    }
  }

  async historyCancelRetranscribe(): Promise<void> {
    this.#redoAbort?.abort();
    if (this.#redo?.state === "failed") this.#setRedo(undefined);
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
    if (process.platform !== "win32") return;
    const blocked = this.#lastError === "mic-denied" || this.#lastError === "mic-silent";
    await shell.openExternal(blocked ? "ms-settings:privacy-microphone" : "ms-settings:sound");
  }

  /** True when `contents` is the HUD page: only it may press the HUD buttons. */
  ownsHud(contents: WebContents): boolean {
    return !!this.#hudWindow?.owns?.(contents);
  }

  hudAction(a: HudAction): void {
    this.presenter.dismiss();
    if (a === "retry") void this.retry();
    else if (a === "download") this.#downloadFromHud();
    else if (a === "sound-settings") void this.openSoundSettings();
  }

  #downloadFromHud(): void {
    this.#ctx.showWindow();
    this.#ctx.sendUi({ type: "nav", page: "dictation" });
    void this.download(this.#cfg.model);
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
