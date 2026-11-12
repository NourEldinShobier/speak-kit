import { join } from "node:path";
import {
  IdleRelease,
  ModelSwitcher,
  AutoSwitch,
  STT_MODELS,
  adoptFound,
  deleteModelFiles,
  diskUse,
  findModelsOnDisk,
  forgetFailure,
  importModelFile,
  importedAsModel,
  loadImported,
  missingImported,
  onGpuFailure,
  planDevice,
  recordFailure,
  removeImported,
  resolveLanguage,
  type FoundModel,
  type Hardware,
  type ImportedModel,
  type SttLanguage,
  type SttModel,
  type SttModelId,
} from "@speakkit/engine";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { DictationModelId } from "../../shared/dictation/settings";
import type { EnginesConfig } from "../../shared/speech-models/config";
import type { DeviceValue, FoundView, ImportOutcome, SpeechModelsView, SwitchOutcome, SwitchRuleView } from "../../shared/speech-models/contract";
import type { ModelManager } from "../dictation/models";
import type { Stt } from "../dictation/stt";
import { buildView } from "./view";

/** What the service needs from the engine besides the speech interface. */
export interface SttExtras {
  backend?: "gpu" | "cpu" | undefined;
  workerPid?: number | undefined;
  busy?: boolean;
}

export interface SpeechModelsDeps {
  modelsDir: string;
  stt: Stt & SttExtras;
  models: ModelManager;
  config(): { dictation: DictationConfig; engines: EnginesConfig };
  save(): void;
  /** Writes the model (and a fitting language) into the dictation settings. */
  choose(id: DictationModelId, language: string): void;
  recording(): boolean;
  dictationSupported(): boolean;
  hardware(): Promise<Hardware>;
  /** Opens a file dialog; undefined when it was cancelled. */
  pickFile(title: string): Promise<string | undefined>;
  openFolder(path: string): Promise<void>;
  openProxySettings(): Promise<void>;
  /** Working set of a process in megabytes; undefined when it cannot be read. */
  memoryOf(pid: number): Promise<number | undefined>;
  /** Folders to look in for models that are already on this computer. */
  scanDirs(): string[];
  changed(): void;
  platform: NodeJS.Platform;
  now?: () => number;
}

const NOW = Date.now;

/**
 * The speech models page as a service: the catalog plus the models the person added, downloads you can pause, the device choice with failed cards
 * remembered per driver, idle release, switching that cannot lose the working model, and automatic switching. Everything the page shows comes from view().
 */
export class SpeechModels {
  readonly #d: SpeechModelsDeps;
  #imported: ImportedModel[] = [];
  #missing = new Set<string>();
  #hw: Hardware | undefined;
  #hwReady: Promise<void> | undefined;
  #disk: { total: number; per: Record<string, number> } = { total: 0, per: {} };
  #movedByMemory = false;
  #languageNote: { model: string; text: string } | undefined;
  #measured: { id: string; mb: number; setup: string } | undefined;
  #found: FoundModel[] = [];
  readonly idle: IdleRelease;
  readonly switcher: ModelSwitcher;
  readonly auto: AutoSwitch;

  constructor(deps: SpeechModelsDeps) {
    this.#d = deps;
    this.idle = new IdleRelease({
      minutes: () => this.#cfg.idleMinutes,
      busy: () => !!this.#d.stt.busy || this.#d.recording() || this.#d.models.busy,
      release: async () => {
        await this.#d.stt.unload();
        this.#d.changed();
      },
    });
    this.switcher = new ModelSwitcher({
      current: () => this.#dict.model as SttModelId,
      downloaded: async (id) => this.#d.models.isInstalled(id),
      load: (id) => this.#d.stt.load(id),
      abort: () => this.#d.stt.unload(),
      save: (id) => this.#choose(id as DictationModelId),
      recording: () => this.#d.recording(),
    });
    this.auto = new AutoSwitch({
      enabled: () => this.#cfg.autoSwitch.enabled && this.#d.models.installed,
      rules: () => this.#cfg.autoSwitch.rules.map((r) => ({ ...r, model: r.model as SttModelId, language: r.language as SttLanguage | undefined })),
      downloaded: () => new Set(this.catalog().filter((m) => this.#d.models.isInstalled(m.id)).map((m) => m.id)),
      current: () => ({ model: this.#dict.model as SttModelId, language: this.#dict.language as never }),
      recording: () => this.#d.recording(),
      apply: async (model, language) => {
        const r = await this.switcher.switchTo(model);
        if (r.ok && language && language !== this.#dict.language) this.#d.choose(this.#dict.model, resolveLanguage(this.#find(model)!, language).language);
        this.#d.changed();
      },
    });
  }

  get #cfg(): EnginesConfig {
    return this.#d.config().engines;
  }
  get #dict(): DictationConfig {
    return this.#d.config().dictation;
  }

  /** Reads the models the person added, looks at the hardware and the disk. Safe to call again. */
  async init(): Promise<void> {
    this.#imported = await loadImported(this.#d.modelsDir);
    this.#hwReady ??= this.#d
      .hardware()
      .then((h) => void (this.#hw = h))
      .catch(() => undefined);
    await this.#hwReady;
    await this.refreshDisk();
    this.#d.changed();
  }

  /** Catalog models and the models the person added. */
  catalog(): readonly SttModel[] {
    return [...STT_MODELS, ...this.#imported.map(importedAsModel)];
  }
  #find(id: string): SttModel | undefined {
    return this.catalog().find((m) => m.id === id);
  }

  hardware(): Hardware | undefined {
    return this.#hw;
  }

  async refreshDisk(): Promise<void> {
    const cat = this.catalog();
    const use = await diskUse(this.#d.modelsDir, cat);
    this.#disk = { total: use.total, per: use.perModel };
    this.#missing = new Set((await missingImported(this.#d.modelsDir, this.#imported)).map((m) => m.id));
  }

  // ---- the engine asks ----------------------------------------------------------------------------------------

  /** Whether the next load may use the graphics card: decided from the device choice, the cards that failed on this driver and an earlier timing. */
  gpuWanted(): boolean {
    return this.#plan().gpu;
  }
  timeIntegrated(): boolean {
    return this.#plan().timeIntegrated;
  }
  #plan() {
    const gpu = this.#hw?.gpu;
    return planDevice({ choice: this.#cfg.device, gpu, failed: this.#cfg.failedDevices, timed: gpu ? this.#cfg.timedDevices[`${gpu.name}|${gpu.driver}`] : undefined });
  }
  /** The integrated card was timed against the CPU: remember the winner for this driver. */
  onTimed(winner: "gpu" | "cpu"): void {
    const gpu = this.#hw?.gpu;
    if (!gpu) return;
    this.#cfg.timedDevices[`${gpu.name}|${gpu.driver}`] = winner;
    this.#d.save();
  }
  /** Loading on the card failed and the engine went on with the CPU. An out-of-memory failure is not held against the card. */
  onGpuFallback(message: string): void {
    const gpu = this.#hw?.gpu;
    const { markFailed } = onGpuFailure(message);
    if (markFailed && gpu) {
      this.#cfg.failedDevices = recordFailure(this.#cfg.failedDevices, gpu, message, (this.#d.now ?? NOW)());
      this.#d.save();
    } else this.#movedByMemory = true;
    this.#d.changed();
  }
  /** A model is ready or was just used: the idle wait starts over. */
  used(id?: string): void {
    this.idle.touch();
    if (id) {
      this.#cfg.lastUsed[id] = (this.#d.now ?? NOW)();
    }
  }
  /** The window was destroyed to free memory: with the setting on, the speech model goes too, unless dictation needs it for the hotkey. */
  windowReleased(): void {
    if (this.#cfg.releaseOnClose && !this.#dict.enabled) void this.#d.stt.unload().then(() => this.#d.changed());
  }

  // ---- the page ---------------------------------------------------------------------------------------------

  view(): SpeechModelsView {
    const cat = this.catalog();
    return buildView({
      catalog: cat,
      installed: new Set(cat.filter((m) => this.#d.models.isInstalled(m.id) && !this.#missing.has(m.id)).map((m) => m.id)),
      missingFiles: this.#missing,
      selected: this.#dict.model,
      language: this.#dict.language,
      config: this.#cfg,
      hardware: this.#hw,
      transfers: this.#d.models.transfers.list(),
      preparing: this.#d.models.views().find((v) => v.progress?.kind === "preparing")?.id,
      failure: this.#d.models.failure,
      diskPerModel: this.#disk.per,
      diskTotal: this.#disk.total,
      folder: join(this.#d.modelsDir, "stt"),
      backend: this.#d.stt.backend,
      movedToCpuByMemory: this.#movedByMemory,
      measured: this.#measured,
      switching: this.switcher.switching,
      recording: this.#d.recording(),
      dictationSupported: this.#d.dictationSupported(),
      platform: this.#d.platform,
      languageNote: this.#languageNote,
    });
  }

  // ---- actions ----------------------------------------------------------------------------------------------

  async download(id: string): Promise<SpeechModelsView> {
    if (!this.#find(id) || this.#find(id)!.origin === "custom") return this.view();
    this.#cfg.skippedModel = false;
    await this.#d.models.download(id as DictationModelId);
    await this.refreshDisk();
    return this.view();
  }

  pause(id: string): SpeechModelsView {
    this.#d.models.pause(id);
    return this.view();
  }
  resume(id: string): SpeechModelsView {
    this.#d.models.resume(id);
    return this.view();
  }
  async cancelDownload(id: string): Promise<SpeechModelsView> {
    if (this.#d.models.transfers.get(id)) this.#d.models.transfers.cancel(id);
    else await this.#d.models.cancel();
    await this.#d.models.refresh();
    return this.view();
  }

  /** Switches to an installed model: loaded first, saved only if that worked, the old model back otherwise. */
  async use(id: string): Promise<SwitchOutcome> {
    const target = this.#find(id);
    if (!target) return { ok: false, reason: "unknown", message: "That model is not in the list." };
    if (this.#missing.has(id)) return { ok: false, reason: "file-missing", message: "The file of this model is missing. Find the file or remove the model." };
    const r = await this.switcher.switchTo(id as SttModelId);
    this.#d.changed();
    return r.ok ? { ok: true } : { ok: false, reason: r.reason, message: r.message };
  }

  #choose(id: DictationModelId): void {
    const model = this.#find(id);
    const wanted = this.#dict.language;
    const fit = model ? resolveLanguage(model, wanted) : { language: wanted, changed: false };
    this.#languageNote = fit.changed && model ? { model: id, text: `${model.name} does not handle ${wanted === "auto" ? "automatic detection" : wanted}, so the language was switched to English.` } : undefined;
    this.#d.choose(id, fit.language);
    this.used(id);
  }

  async cancelSwitch(): Promise<SpeechModelsView> {
    await this.switcher.cancel();
    return this.view();
  }

  /** Deletes the model's file from our folder. Never touches a file the person keeps elsewhere; an imported model's original stays where it is. */
  async remove(id: string): Promise<number> {
    const m = this.#find(id);
    if (!m) return 0;
    if (this.#dict.model === id) await this.#d.stt.unload().catch(() => undefined);
    const freed = await deleteModelFiles(this.#d.modelsDir, m);
    if (m.origin === "custom") {
      await removeImported(this.#d.modelsDir, id);
      this.#imported = this.#imported.filter((x) => x.id !== id);
    }
    await this.#d.models.refresh();
    await this.refreshDisk();
    this.#d.changed();
    return freed;
  }

  setIdleMinutes(minutes: EnginesConfig["idleMinutes"]): SpeechModelsView {
    this.#cfg.idleMinutes = minutes;
    this.#d.save();
    if (this.#d.stt.status().state === "ready") this.idle.touch();
    else this.idle.stop();
    return this.view();
  }

  /** Takes effect on the next load; a model that is loaded is reloaded now when it runs somewhere else than the choice says. */
  async setDevice(choice: DeviceValue): Promise<SpeechModelsView> {
    this.#cfg.device = choice;
    this.#movedByMemory = false;
    this.#d.save();
    await this.#reloadIfIdle();
    return this.view();
  }

  async retryGraphicsCard(): Promise<SpeechModelsView> {
    this.#cfg.failedDevices = forgetFailure(this.#cfg.failedDevices);
    this.#movedByMemory = false;
    this.#d.save();
    await this.#reloadIfIdle();
    return this.view();
  }

  /** Reloads so the new device plan applies; never while a job is queued or a recording runs, and never two copies at once (the engine unloads first). */
  async #reloadIfIdle(): Promise<void> {
    if (this.#d.stt.status().state !== "ready" || this.#d.stt.busy || this.#d.recording()) return this.#d.changed();
    await this.#d.stt.unload();
    this.#d.models.warm();
    this.#d.changed();
  }

  setReleaseOnClose(on: boolean): SpeechModelsView {
    this.#cfg.releaseOnClose = on;
    this.#d.save();
    return this.view();
  }

  async importFile(kind: "multilingual" | "english", name: string): Promise<ImportOutcome> {
    const source = await this.#d.pickFile("Choose a speech model file");
    if (!source) return { cancelled: true };
    return this.#import({ source, kind, ...(name.trim() && { name: name.trim() }) });
  }

  /** Points at the file of an imported model whose copy went missing; only the same file (same fingerprint) is accepted. */
  async locateFile(id: string): Promise<ImportOutcome> {
    const known = this.#imported.find((m) => m.id === id);
    if (!known) return { ok: false, reason: "unknown", message: "That model is not in the list." };
    const source = await this.#d.pickFile(`Find the file of ${known.name}`);
    if (!source) return { cancelled: true };
    return this.#import({ source, expectSha256: known.sha256 });
  }

  async #import(o: { source: string; kind?: "multilingual" | "english"; name?: string; expectSha256?: string }): Promise<ImportOutcome> {
    const r = await importModelFile({ modelsDir: this.#d.modelsDir, ...o, now: this.#d.now ?? NOW });
    if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
    this.#imported = await loadImported(this.#d.modelsDir);
    await this.#d.models.refresh();
    await this.refreshDisk();
    this.#d.changed();
    return { ok: true, id: r.model.id, name: r.model.name, alreadyThere: r.alreadyThere };
  }

  async removeImported(id: string): Promise<SpeechModelsView> {
    await this.remove(id);
    return this.view();
  }

  /** Read-only look in the usual folders for files that are exactly one of our models. Nothing is copied until the person says so. */
  async scanDisk(): Promise<FoundView[]> {
    const have = new Set(this.catalog().filter((m) => this.#d.models.isInstalled(m.id)).map((m) => m.id));
    const builtin = STT_MODELS.filter((m) => !have.has(m.id));
    this.#found = await findModelsOnDisk(this.#d.scanDirs(), builtin);
    return this.#found.map((f) => ({ id: f.id, name: this.#find(f.id)?.name ?? f.id, path: f.path }));
  }

  async adoptFound(ids: string[]): Promise<SpeechModelsView> {
    for (const f of this.#found.filter((x) => ids.includes(x.id))) {
      const m = STT_MODELS.find((x) => x.id === f.id);
      if (m) await adoptFound(this.#d.modelsDir, f, m);
    }
    await this.#d.models.refresh();
    await this.refreshDisk();
    this.#d.changed();
    return this.view();
  }

  setAutoSwitch(c: { enabled: boolean; rules: SwitchRuleView[] }): SpeechModelsView {
    this.#cfg.autoSwitch = { enabled: c.enabled, rules: c.rules.map((r) => ({ ...r })) };
    this.#d.save();
    return this.view();
  }

  dismissNewer(id: string): SpeechModelsView {
    if (!this.#cfg.dismissedHints.includes(id)) this.#cfg.dismissedHints.push(id);
    this.#d.save();
    return this.view();
  }

  continueWithoutModel(): SpeechModelsView {
    this.#cfg.skippedModel = true;
    this.#d.save();
    return this.view();
  }

  /** Reads what the loaded model takes in memory right now; the setup says what was measured. */
  async measureMemory(): Promise<SpeechModelsView> {
    const pid = this.#d.stt.workerPid;
    const id = this.#dict.model;
    if (pid && this.#d.stt.status().state === "ready") {
      const mb = await this.#d.memoryOf(pid);
      if (mb !== undefined) this.#measured = { id, mb, setup: `${this.#d.stt.backend === "gpu" ? "graphics card" : "CPU"}, idle after loading, this computer` };
    }
    return this.view();
  }

  openProxySettings(): Promise<void> {
    return this.#d.openProxySettings();
  }
  openModelsFolder(): Promise<void> {
    return this.#d.openFolder(join(this.#d.modelsDir, "stt"));
  }

  dispose(): void {
    this.idle.stop();
  }
}
