import { dialog, type BrowserWindow } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyMode,
  applyRules,
  defaultSettings,
  resolveMode,
  soundsLikeRules,
  timeLeft,
  type AudioStore,
  type Dictation,
  type HistoryHit,
  type Clip,
  type Settings,
  type TranscribeResult,
} from "@speakkit/dictation";
import { languageLabel, type SttLanguage } from "@speakkit/engine";
import type { DictationStatus, HistoryItem } from "../../shared/dictation/contract";
import type { DictationConfig, DictationModelId } from "../../shared/dictation/settings";
import { friendlyAppName } from "./app-name";
import { encodeWav } from "./audio-store";
import { supportsLanguage } from "./models";
import { coreSettings } from "./service-support";
import { heard, type Stt } from "./stt";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

export interface FilePickers {
  open(filters: { name: string; extensions: string[] }[]): Promise<string | null>;
  save(defaultName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>;
}

/** The system file dialogs, or the scripted answers a test gives (null cancels). */
export function filePickers(parent: () => BrowserWindow | null, scripted?: { open: string | null; save: string | null }): FilePickers {
  if (scripted) return { open: async () => scripted.open, save: async () => scripted.save };
  return {
    open: async (filters) => {
      const w = parent();
      const opts = { properties: ["openFile" as const], filters };
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    save: async (defaultName, filters) => {
      const w = parent();
      const opts = { defaultPath: defaultName, filters };
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
  };
}

/** The name of the model that heard an entry and the language it was told (a label); absent for entries from before these were stored. */
const heardBy = (e: HistoryHit, catalog: Deps["catalog"]) => ({
  ...(e.model && { model: catalog?.().find((m) => m.id === e.model)?.name ?? e.model }),
  ...(e.language && { language: languageLabel(e.language as SttLanguage) }),
});

interface Deps {
  /** The whole history was cleared. */
  cleared?(): void;
  ready(): Promise<unknown>;
  core(): Dictation | undefined;
  audio(): AudioStore | undefined;
  cfg(): DictationConfig;
  /** A dictation is recording, transcribing or inserting: the speech engine is in use. */
  dictating(): boolean;
  stt: Stt;
  /** Every speech model, to show the name of the one that heard an entry. */
  catalog?(): readonly { id: string; name: string }[];
  files: FilePickers;
  /** Sends the status to the window. */
  push(): void;
  refreshCount(): Promise<void>;
  warn(title: string, detail: string): void;
  /** Whether an OpenAI key is saved, and whether the test hook is on (a scripted writer then stands in for the key). */
  key: { hasKey?: (() => Promise<boolean>) | undefined; test: boolean };
}

/** What the History page and the vocabulary files need from the main process: entries, versions, recordings, notices and the two file dialogs. */
export class HistoryApi {
  readonly d: Deps;
  #kept = 0;
  #rev = 0;
  #redo: DictationStatus["redo"];
  #redoAbort: AbortController | undefined;
  #hasKey = false;
  #promptDropped = false;
  /** The last "Transcribe again" work, until it has finished and put the chosen model back. A cancel stops waiting for it, not the work. */
  #settling: Promise<void> | undefined;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** What the status carries of the history beyond its size, and of the rewrite key and the word list. */
  parts() {
    const { core, key } = this.d;
    return {
      historyStatus: core()?.history.status() ?? "ok",
      keptRecordings: this.#kept,
      historyRev: this.#rev,
      redo: this.#redo,
      historyCopy: core()?.history.preservedAs(),
      rewriteKey: this.#hasKey || (__TEST_CODE__ && key.test),
      promptDropped: this.#promptDropped,
    };
  }

  /** The key can be saved or removed on the Voice chat page at any time. */
  async refreshKey(): Promise<void> {
    this.#hasKey = (await this.d.key.hasKey?.()) ?? false;
  }

  /** The speech model cannot read the word list (true), or a change made it worth trying again (false). */
  setPromptDropped(on: boolean): void {
    if (this.#promptDropped === on) return;
    this.#promptDropped = on;
    this.d.push();
  }

  #item(e: HistoryHit, now: number): HistoryItem {
    const left = timeLeft(e, now, this.d.cfg().retention);
    return {
      ...heardBy(e, this.d.catalog),
      id: e.id,
      at: e.at,
      text: e.text,
      raw: e.raw,
      durationMs: e.durationMs,
      expiresInMs: Number.isFinite(left) ? left : null,
      ...(e.app && { app: e.app, appName: e.displayName ?? friendlyAppName(e.app) ?? e.app }),
      ...(e.kind && { kind: e.kind }),
      ...(e.timings && { timings: e.timings }),
      ...(e.outcome && { outcome: e.outcome }),
      ...(e.rewrite && { rewrite: e.rewrite }),
      ...(e.audio && { recording: true }),
      ...(e.audioRemoved && { recordingRemoved: true }),
      ...(e.versions && { versions: e.versions }),
      ...(e.version && { version: e.version }),
      ...(e.via && { via: e.via }),
    };
  }

  async list(search?: string): Promise<HistoryItem[]> {
    await this.d.ready();
    const items = (await this.d.core()?.history.list(search ? { search } : undefined)) ?? [];
    const now = Date.now();
    return items.map((e) => this.#item(e, now));
  }

  async stats() {
    await this.d.ready();
    return (await this.d.core()?.history.stats()) ?? { dictations: 0, words: 0, wordsPerMinute: 0, listeningMs: 0, topApps: [], outcomes: { pasted: 0, copied: 0, failed: 0 } };
  }

  async recent(n: number): Promise<HistoryItem[]> {
    await this.d.ready();
    const now = Date.now();
    return ((await this.d.core()?.history.recent(n)) ?? []).map((e) => this.#item(e, now));
  }

  async copy(id: string): Promise<boolean> {
    await this.d.ready();
    return (await this.d.core()?.history.copy(id)) ?? false;
  }

  #noteKept(kept: string[]): void {
    if (!kept.length) return;
    this.#kept += kept.length;
    this.d.warn("dictation recording kept", `${kept.length} not moved to the Recycle Bin`);
    this.d.push();
  }

  async remove(ids: string[]): Promise<void> {
    await this.d.ready();
    this.#noteKept((await this.d.core()?.history.removeMany(ids))?.kept ?? []);
    await this.d.refreshCount();
  }

  async clear(): Promise<void> {
    await this.d.ready();
    this.#noteKept((await this.d.core()?.history.clear())?.kept ?? []);
    this.d.cleared?.();
    await this.d.refreshCount();
  }

  async dismissNotice(): Promise<void> {
    this.#kept = 0;
    this.d.push();
  }

  async useVersion(id: string, versionId: string): Promise<boolean> {
    await this.d.ready();
    const ok = (await this.d.core()?.history.useVersion(id, versionId)) ?? false;
    this.#rev++;
    this.d.push();
    return ok;
  }

  async audio(id: string): Promise<Uint8Array | null> {
    await this.d.ready();
    const clip = await this.d.core()?.history.audio(id);
    return clip ? new Uint8Array(encodeWav(clip)) : null;
  }

  async deleteRecording(id: string): Promise<void> {
    await this.d.ready();
    const file = (await this.d.core()?.history.get(id))?.audio;
    const audio = this.d.audio();
    if (!file || !audio) return;
    if (await audio.trash(file)) await this.d.core()?.history.dropAudio([file]);
    else this.#noteKept([file]);
    this.#rev++;
    this.d.push();
  }

  async export(): Promise<string | null> {
    await this.d.ready();
    const target = await this.d.files.save("speakkit-history.json", [{ name: "JSON", extensions: ["json"] }]);
    if (!target) return null;
    const entries = (await this.d.core()?.history.list()) ?? [];
    await writeFile(target, JSON.stringify({ version: 1, entries: entries.map(({ id, at, text, raw, app, model, durationMs }) => ({ id, at, text, raw, app, model, durationMs })) }, null, 2));
    return target;
  }

  async vocabImport() {
    const file = await this.d.files.open([{ name: at("filter.wordLists"), extensions: ["json", "txt", "csv"] }]);
    if (!file) return null;
    if ((await stat(file)).size > 2_000_000) throw new Error("too-large");
    const ext = path.extname(file).slice(1).toLowerCase();
    return { format: (ext === "txt" || ext === "csv" ? ext : "json") as "json" | "txt" | "csv", text: await readFile(file, "utf8"), name: path.basename(file) };
  }

  async vocabExport(format: "json" | "txt" | "csv", text: string): Promise<string | null> {
    const target = await this.d.files.save(`speakkit-vocabulary.${format}`, [{ name: format.toUpperCase(), extensions: [format] }]);
    if (!target) return null;
    await writeFile(target, text, "utf8");
    return target;
  }

  #setRedo(redo: DictationStatus["redo"]): void {
    this.#redo = redo;
    this.d.push();
  }

  /** One transcription with `model`: loads it when it is not the chosen one and puts the chosen one back after. Gives "cancelled" when the person cancels first. */
  async #run({ model, clip, wanted }: { model: DictationModelId; clip: Clip; wanted: DictationConfig["language"] }, abort: AbortController): Promise<TranscribeResult | "cancelled"> {
    const cancelled = new Promise<"cancelled">((resolve) => abort.signal.addEventListener("abort", () => resolve("cancelled"), { once: true }));
    const selected = this.d.cfg().model;
    const language = supportsLanguage(model, wanted) ? wanted : "auto";
    const work = async (): Promise<TranscribeResult> => {
      if (model !== selected) await this.d.stt.load(model);
      try {
        return await heard({ stt: this.d.stt, model: () => model, onFailedClip: () => undefined }, { clip, language });
      } finally {
        if (model !== selected) await this.d.stt.load(selected).catch(() => this.d.warn("dictation model not restored", selected));
      }
    };
    const running = work();
    const settled: Promise<void> = running.then(
      () => undefined,
      () => undefined,
    );
    this.#settling = settled;
    void settled.then(() => {
      if (this.#settling === settled) this.#settling = undefined;
    });
    return Promise.race([running, cancelled]);
  }

  /** The text of a new version: what the model heard, put through the same rules and words as a live dictation into the same program. */
  #versionText(heardText: string, language: string | undefined, app: string | undefined): string {
    const base: Settings = { ...defaultSettings, ...coreSettings(this.d.cfg()) };
    const eff = applyMode(base, resolveMode(base.modes, app));
    return applyRules(heardText, { ...eff, replacements: [...eff.replacements, ...soundsLikeRules(eff.terms)], language: language ?? this.d.cfg().language }).trimEnd();
  }

  /**
   * Transcribes a kept recording again with another (or the same) installed model and stores the result as a new version; the text in use does not
   * change until the person picks it. A model that is not installed, a recording that is gone and an engine failure each end in a visible failed state.
   */
  async retranscribe(id: string, model: DictationModelId, language?: DictationConfig["language"]): Promise<void> {
    await this.d.ready();
    await this.#settling; // a cancelled run may still be putting the chosen model back
    const core = this.d.core();
    if (this.#redo?.state === "running" || !core) return;
    const fail = (error: "model-missing" | "failed" | "no-audio" | "busy") => this.#setRedo({ id, model, state: "failed", error });
    // The speech engine is shared: swapping its model under a live dictation would run that dictation on the wrong one.
    if (this.d.dictating()) return fail("busy");
    this.#setRedo({ id, model, state: "running" });
    const abort = (this.#redoAbort = new AbortController());
    try {
      const entry = await core.history.get(id);
      const clip = await core.history.audio(id);
      if (!entry || !clip) return fail("no-audio");
      if (!(await this.d.stt.downloaded(model))) return fail("model-missing");
      const started = Date.now();
      const result = await this.#run({ model, clip, wanted: language ?? this.d.cfg().language }, abort);
      if (result === "cancelled") {
        await this.#settling; // stays "running" until the chosen model is back
        return this.#setRedo(undefined);
      }
      if (!result.ok || !result.text) return fail("failed");
      await core.history.addVersion(id, { model, at: Date.now(), text: this.#versionText(result.text, result.language ?? language, entry.app), ms: Date.now() - started });
      this.#rev++;
      this.#setRedo(undefined);
    } catch {
      fail("failed");
    } finally {
      if (this.#redoAbort === abort) this.#redoAbort = undefined;
    }
  }

  async cancelRetranscribe(): Promise<void> {
    this.#redoAbort?.abort();
    if (this.#redo?.state === "failed") this.#setRedo(undefined);
  }
}
