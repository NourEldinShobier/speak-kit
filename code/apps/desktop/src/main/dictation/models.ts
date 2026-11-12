import { DownloadError, STT_MODELS, Transfers, type SttModel, type SttModelId } from "@speakkit/engine";
import type { DictationModelId } from "../../shared/dictation/settings";
import { modelViews, type ModelProgress, type Stt } from "./stt";

/** Best effort: whatever this promise ends in, the caller goes on (an unload that fails leaves nothing to clean up). */
export const settle = (p: Promise<unknown>): Promise<void> =>
  p.then(
    () => undefined,
    () => undefined,
  );

export const supportsLanguage = (id: DictationModelId, language: string, models: readonly SttModel[] = STT_MODELS) => {
  const m = models.find((x) => x.id === id);
  if (!m) return language === "auto" || language === "en";
  return m.languages.includes(language as never) && (language !== "auto" || m.detects);
};

interface Deps {
  stt: Stt;
  /** The model dictation uses (from the settings). */
  selected(): DictationModelId;
  /** Chooses the model for dictation; called when a download starts, because downloading one means wanting it. */
  select(id: DictationModelId): void;
  /** Something the Settings page shows changed. `soon` skips the throttle. */
  changed(soon?: boolean): void;
  /** Every model there is: the catalog plus the ones the person added. */
  models?(): readonly SttModel[];
  /** One transfer per model; a second request for a model that is downloading joins it. */
  transfers?: Transfers;
  /** Why the speech engine cannot start on this computer (a processor without the needed instructions); nothing is loaded or downloaded then. */
  blocked?(): string | undefined;
}

/**
 * The speech models of dictation: which are on disk, the downloads in progress (resumable, one per model), the one load in progress, and the failure
 * the page should show. One model is loaded at a time (it holds about a gigabyte of graphics memory), so choosing another unloads the old one.
 */
export class ModelManager {
  readonly #d: Deps;
  readonly transfers: Transfers;
  readonly #installed = new Map<string, boolean>();
  #job: ModelProgress | null = null;
  #started = 0;
  #cancelled = false;
  /** Dictation was switched off: nothing may load a model again until it is switched on. */
  #stopped = false;
  error: string | undefined;
  /** Why the last download failed, with the host and what to do; cleared by the next attempt. */
  failure: { id: string; error: DownloadError } | undefined;

  constructor(deps: Deps) {
    this.#d = deps;
    this.transfers = deps.transfers ?? new Transfers();
    this.transfers.onChange(() => this.#d.changed());
  }

  get catalog(): readonly SttModel[] {
    return this.#d.models?.() ?? STT_MODELS;
  }
  get busy(): boolean {
    return this.#job !== null;
  }
  get installed(): boolean {
    return this.isInstalled(this.#d.selected());
  }
  get ready(): boolean {
    return this.#d.stt.status().state === "ready" && !this.#job;
  }
  isInstalled(id: string): boolean {
    return this.#installed.get(id) ?? false;
  }
  views() {
    const transfers = this.transfers.list();
    return modelViews(this.catalog, this.#d.selected(), { isInstalled: (id) => this.isInstalled(id), job: this.#job, transfers });
  }

  async refresh(): Promise<void> {
    const next = new Map<string, boolean>();
    for (const m of this.catalog) next.set(m.id, await this.#d.stt.downloaded(m.id as SttModelId).catch(() => false));
    this.#installed.clear();
    for (const [k, val] of next) this.#installed.set(k, val);
  }

  /** Loads the selected model in the background when it is on disk. `keepError` leaves a failure shown for something else (a download) in place. */
  warm(keepError = false): void {
    this.#stopped = false;
    this.#reload(keepError);
  }

  #reload(keepError: boolean): void {
    const id = this.#d.selected();
    if (!this.isInstalled(id) || this.#d.stt.status().state === "ready") return;
    const blocked = this.#d.blocked?.();
    if (blocked) return void this.report(blocked);
    void this.#d.stt.warm(id as SttModelId).then(() => {
      const s = this.#d.stt.status();
      if (s.state === "error") this.error = s.detail ?? "The speech model could not be loaded.";
      else if (!keepError) this.error = undefined;
      this.#d.changed(true);
    });
  }

  /** A model failed to load when dictation tried it: the Settings page shows the engine's reason. */
  report(detail: string): void {
    this.error = detail;
    this.#d.changed(true);
  }

  /** Downloads (if needed) and loads the model, and makes it the one dictation uses. A second call for the same model joins the first. */
  async download(id: DictationModelId): Promise<void> {
    const blocked = this.#d.blocked?.();
    if (blocked) return this.report(blocked);
    if (this.#job && this.#job.id !== id) return;
    if (this.#job?.id === id) return void (await this.#running);
    this.#running = this.#download(id);
    await this.#running;
  }
  #running: Promise<void> | undefined;

  async #download(id: DictationModelId): Promise<void> {
    this.#cancelled = false;
    this.#stopped = false;
    this.error = undefined;
    this.failure = undefined;
    this.#job = { id, kind: "downloading", fraction: 0 };
    this.#started = Date.now();
    const off = this.#d.stt.onStatus((s) => this.#job && s.state === "loading" && (this.#job.kind = "preparing"));
    this.#d.changed(true);
    try {
      if (this.#d.stt.download) {
        const stt = this.#d.stt;
        await this.transfers.start(id, ({ signal, progress }) =>
          stt.download!(id as SttModelId, {
            signal,
            progress: (f) => {
              progress(f);
              this.#progress(id, f);
            },
          }),
        );
        this.#job.kind = "preparing";
        this.#d.changed(true);
        await this.#d.stt.load(id as SttModelId);
      } else {
        await this.#d.stt.load(id as SttModelId, (f) => this.#progress(id, f));
      }
      this.#installed.set(id, true);
      this.#d.select(id); // the new model becomes the one dictation uses once it is on disk and loaded
    } catch (e) {
      if (!this.#cancelled) {
        this.error = e instanceof Error ? e.message : String(e);
        if (e instanceof DownloadError) this.failure = { id, error: e };
      }
      await this.refresh();
    } finally {
      off();
      this.#job = null;
      this.#running = undefined;
      // Loading another model unloaded the one dictation uses; a failed or cancelled download must not leave it that way.
      if (!this.#stopped) this.#reload(true);
      this.#d.changed(true);
    }
  }

  pause(id: string): void {
    this.transfers.pause(id);
  }
  resume(id: string): void {
    this.transfers.resume(id);
  }

  /** Stops a download or load in progress; a model that is loaded and idle stays loaded. */
  async cancel(): Promise<void> {
    if (!this.#job) return;
    this.#cancelled = true;
    this.transfers.cancel(this.#job.id);
    await settle(this.#d.stt.unload());
  }

  /** Frees the model (dictation turned off); a download in progress is stopped without an error. */
  async unload(): Promise<void> {
    this.#cancelled = true;
    this.#stopped = true;
    await settle(this.#d.stt.unload());
  }

  /** Switches to an installed model. Returns false when it is not on disk, which a page cannot choose. */
  async switchTo(id: DictationModelId): Promise<boolean> {
    if (!this.isInstalled(id)) return false;
    this.#d.select(id);
    await settle(this.#d.stt.unload());
    this.warm();
    return true;
  }

  #progress(id: DictationModelId, fraction: number): void {
    if (!this.#job) return;
    const spent = (Date.now() - this.#started) / 1000;
    const eta = fraction > 0.02 && spent > 1 ? Math.round((spent / fraction) * (1 - fraction)) : undefined;
    this.#job = { id, kind: this.#job.kind, fraction, ...(eta !== undefined && { etaSeconds: eta }) };
    this.#d.changed();
  }
}
