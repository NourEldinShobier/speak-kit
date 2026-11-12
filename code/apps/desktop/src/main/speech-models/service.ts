import { join } from "node:path";
import { IdleRelease, ModelSwitcher, AutoSwitch, checkFloor, resolveLanguage, type Hardware, type SttLanguage, type SttModel, type SttModelId } from "@speakkit/engine";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { DictationModelId } from "../../shared/dictation/settings";
import type { EnginesConfig } from "../../shared/speech-models/config";
import type { DeviceValue, FoundView, ImportOutcome, SpeechModelsView, SwitchOutcome, SwitchRuleView } from "../../shared/speech-models/contract";
import type { ModelManager } from "../dictation/models";
import type { Stt } from "../dictation/stt";
import { DevicePolicy } from "./device-policy";
import { ModelLibrary } from "./library";
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
  readonly #lib: ModelLibrary;
  #hw: Hardware | undefined;
  #hwReady: Promise<void> | undefined;
  readonly #device: DevicePolicy;
  #languageNote: { model: string; text: string } | undefined;
  #measured: { id: string; mb: number; setup: string } | undefined;
  readonly idle: IdleRelease;
  readonly switcher: ModelSwitcher;
  readonly auto: AutoSwitch;

  constructor(deps: SpeechModelsDeps) {
    this.#d = deps;
    this.#lib = new ModelLibrary({
      modelsDir: deps.modelsDir,
      models: deps.models,
      selected: () => this.#dict.model,
      unload: () => deps.stt.unload(),
      pickFile: deps.pickFile,
      scanDirs: deps.scanDirs,
      changed: deps.changed,
      now: deps.now ?? NOW,
    });
    this.#device = new DevicePolicy({ config: () => this.#cfg, gpu: () => this.#hw?.gpu, save: deps.save, changed: deps.changed, now: deps.now ?? NOW });
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
      downloaded: () =>
        new Set(
          this.catalog()
            .filter((m) => this.#d.models.isInstalled(m.id))
            .map((m) => m.id),
        ),
      current: () => ({ model: this.#dict.model as SttModelId, language: this.#dict.language as never }),
      recording: () => this.#d.recording(),
      apply: async (model, language) => {
        const r = await this.switcher.switchTo(model);
        if (r.ok && language && language !== this.#dict.language) this.#d.choose(this.#dict.model, resolveLanguage(this.#lib.find(model)!, language).language);
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
    await this.#lib.init();
    // The probe leaves unknown what it cannot read and never rejects.
    this.#hwReady ??= this.#d.hardware().then((h) => void (this.#hw = h));
    await this.#hwReady;
    this.#d.changed();
  }

  /** Catalog models and the models the person added. */
  catalog(): readonly SttModel[] {
    return this.#lib.catalog();
  }
  hardware(): Hardware | undefined {
    return this.#hw;
  }

  /** Set when this computer lacks what the engine needs: the engine code is then never loaded and the page says what is missing. */
  floorMessage(): string | undefined {
    const v = this.#hw && checkFloor(this.#hw);
    return v && !v.ok ? v.message : undefined;
  }

  refreshDisk(): Promise<void> {
    return this.#lib.refreshDisk();
  }

  // ---- the engine asks ----------------------------------------------------------------------------------------

  /** Where speech runs; the engine asks these at every load. */
  gpuWanted(): boolean {
    return this.#device.gpuWanted();
  }
  timeIntegrated(): boolean {
    return this.#device.timeIntegrated();
  }
  onTimed(winner: "gpu" | "cpu"): void {
    this.#device.onTimed(winner);
  }
  onGpuFallback(message: string): void {
    this.#device.onGpuFallback(message);
  }
  /** A recording ended: an automatic switch that was held back during it happens now. */
  recordingEnded(): void {
    this.auto.recordingEnded();
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
      installed: new Set(cat.filter((m) => this.#d.models.isInstalled(m.id) && !this.#lib.missing.has(m.id)).map((m) => m.id)),
      missingFiles: this.#lib.missing,
      selected: this.#dict.model,
      language: this.#dict.language,
      config: this.#cfg,
      hardware: this.#hw,
      transfers: this.#d.models.transfers.list(),
      preparing: this.#d.models.views().find((v) => v.progress?.kind === "preparing")?.id,
      failure: this.#d.models.failure,
      queued: this.#d.models.queued,
      diskPerModel: this.#lib.disk.per,
      diskTotal: this.#lib.disk.total,
      folder: this.#lib.folder,
      backend: this.#d.stt.backend,
      movedToCpuByMemory: this.#device.movedByMemory,
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
    if (!this.#lib.find(id) || this.#lib.find(id)!.origin === "custom") return this.view();
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
    if (this.#d.models.queued === id) this.#d.models.unqueue();
    else if (this.#d.models.transfers.get(id)) this.#d.models.transfers.cancel(id);
    else await this.#d.models.cancel();
    await this.#d.models.refresh();
    return this.view();
  }

  /** Switches to an installed model: loaded first, saved only if that worked, the old model back otherwise. */
  async use(id: string): Promise<SwitchOutcome> {
    const target = this.#lib.find(id);
    if (!target) return { ok: false, reason: "unknown", message: "That model is not in the list." };
    if (this.#lib.missing.has(id)) return { ok: false, reason: "file-missing", message: "The file of this model is missing. Find the file or remove the model." };
    const r = await this.switcher.switchTo(id as SttModelId);
    this.#d.changed();
    return r.ok ? { ok: true } : { ok: false, reason: r.reason, message: r.message };
  }

  #choose(id: DictationModelId): void {
    const model = this.#lib.find(id);
    const wanted = this.#dict.language;
    const fit = model ? resolveLanguage(model, wanted) : { language: wanted, changed: false };
    this.#languageNote =
      fit.changed && model ? { model: id, text: `${model.name} does not handle ${wanted === "auto" ? "automatic detection" : wanted}, so the language was switched to English.` } : undefined;
    this.#d.choose(id, fit.language);
    this.used(id);
  }

  async cancelSwitch(): Promise<SpeechModelsView> {
    await this.switcher.cancel();
    return this.view();
  }

  async remove(id: string): Promise<number> {
    return this.#lib.remove(id);
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
    this.#device.choose(choice);
    await this.#reloadIfIdle();
    return this.view();
  }

  async retryGraphicsCard(): Promise<SpeechModelsView> {
    this.#device.forgetFailures();
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

  importFile(kind: "multilingual" | "english", name: string): Promise<ImportOutcome> {
    return this.#lib.importFile(kind, name);
  }
  locateFile(id: string): Promise<ImportOutcome> {
    return this.#lib.locate(id);
  }
  async removeImported(id: string): Promise<SpeechModelsView> {
    await this.#lib.remove(id);
    return this.view();
  }
  scanDisk(): Promise<FoundView[]> {
    return this.#lib.scan();
  }
  async adoptFound(ids: string[]): Promise<SpeechModelsView> {
    await this.#lib.adopt(ids);
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
