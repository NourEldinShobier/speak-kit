import type { SttModelId } from "@speakkit/engine";
import { DICTATION_MODELS, type DictationModelId } from "../../shared/dictation/settings";
import { modelViews, type ModelProgress, type Stt } from "./stt";

/** Best effort: whatever this promise ends in, the caller goes on (an unload that fails leaves nothing to clean up). */
export const settle = (p: Promise<unknown>): Promise<void> =>
  p.then(
    () => undefined,
    () => undefined,
  );

export const supportsLanguage = (id: DictationModelId, language: string) => !(id === "parakeet-tdt-0.6b-v3-q4_0" && language === "ar");

interface Deps {
  stt: Stt;
  /** The model dictation uses (from the settings). */
  selected(): DictationModelId;
  /** Chooses the model for dictation; called when a download starts, because downloading one means wanting it. */
  select(id: DictationModelId): void;
  /** Something the Settings page shows changed. `soon` skips the throttle. */
  changed(soon?: boolean): void;
}

/**
 * The speech models of dictation: which are on disk, the one download or load in progress, and the failure the page should show. One
 * model is loaded at a time (it holds about a gigabyte of graphics memory), so choosing another unloads the old one.
 */
export class ModelManager {
  readonly #d: Deps;
  readonly #installed = Object.fromEntries(DICTATION_MODELS.map((m) => [m, false])) as Record<DictationModelId, boolean>;
  #job: ModelProgress | null = null;
  #started = 0;
  #cancelled = false;
  /** Dictation was switched off: nothing may load a model again until it is switched on. */
  #stopped = false;
  error: string | undefined;

  constructor(deps: Deps) {
    this.#d = deps;
  }

  get busy(): boolean {
    return this.#job !== null;
  }
  get installed(): boolean {
    return this.#installed[this.#d.selected()];
  }
  get ready(): boolean {
    return this.#d.stt.status().state === "ready" && !this.#job;
  }
  isInstalled(id: DictationModelId): boolean {
    return this.#installed[id];
  }
  views() {
    return modelViews(this.#d.selected(), this.#installed, this.#job);
  }

  async refresh(): Promise<void> {
    for (const id of DICTATION_MODELS) this.#installed[id] = await this.#d.stt.downloaded(id as SttModelId).catch(() => false);
  }

  /** Loads the selected model in the background when it is on disk. `keepError` leaves a failure shown for something else (a download) in place. */
  warm(keepError = false): void {
    this.#stopped = false;
    this.#reload(keepError);
  }

  #reload(keepError: boolean): void {
    const id = this.#d.selected();
    if (!this.#installed[id] || this.#d.stt.status().state === "ready") return;
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

  /** Downloads (if needed) and loads the model, and makes it the one dictation uses. */
  async download(id: DictationModelId): Promise<void> {
    if (this.#job) return;
    this.#cancelled = false;
    this.#stopped = false;
    this.error = undefined;
    this.#job = { id, kind: "downloading", fraction: 0 };
    this.#started = Date.now();
    const off = this.#d.stt.onStatus((s) => this.#job && s.state === "loading" && (this.#job.kind = "preparing"));
    this.#d.changed(true);
    try {
      await this.#d.stt.load(id as SttModelId, (f) => this.#progress(id, f));
      this.#installed[id] = true;
      this.#d.select(id); // the new model becomes the one dictation uses once it is on disk and loaded
    } catch (e) {
      if (!this.#cancelled) this.error = e instanceof Error ? e.message : String(e);
      await this.refresh();
    } finally {
      off();
      this.#job = null;
      // Loading another model unloaded the one dictation uses; a failed or cancelled download must not leave it that way.
      if (!this.#stopped) this.#reload(true);
      this.#d.changed(true);
    }
  }

  /** Stops a download or load in progress; a model that is loaded and idle stays loaded. */
  async cancel(): Promise<void> {
    if (!this.#job) return;
    this.#cancelled = true;
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
    if (!this.#installed[id]) return false;
    this.#d.select(id);
    await settle(this.#d.stt.unload());
    this.warm();
    return true;
  }

  #progress(id: DictationModelId, fraction: number): void {
    if (!this.#job) return;
    const spent = (Date.now() - this.#started) / 1000;
    const eta = fraction > 0.02 && spent > 1 ? Math.round((spent / fraction) * (1 - fraction)) : undefined;
    this.#job = { id, kind: "downloading", fraction, ...(eta !== undefined && { etaSeconds: eta }) };
    this.#d.changed();
  }
}
