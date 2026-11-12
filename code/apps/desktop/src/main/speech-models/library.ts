import { join } from "node:path";
import {
  STT_MODELS,
  adoptFound,
  deleteModelFiles,
  diskUse,
  findModelsOnDisk,
  importModelFile,
  importedAsModel,
  loadImported,
  missingImported,
  removeImported,
  type FoundModel,
  type ImportedModel,
  type SttModel,
} from "@speakkit/engine";
import type { FoundView, ImportOutcome } from "../../shared/speech-models/contract";
import type { ModelManager } from "../dictation/models";

export interface LibraryDeps {
  modelsDir: string;
  models: ModelManager;
  /** The model dictation uses; its engine is stopped before its file is deleted. */
  selected(): string;
  unload(): Promise<unknown>;
  pickFile(title: string): Promise<string | undefined>;
  scanDirs(): string[];
  changed(): void;
  now(): number;
}

/** What is in our models folder: the catalog models and the ones the person added, what they take on disk, importing, finding and deleting. Files outside the folder are never touched. */
export class ModelLibrary {
  readonly #d: LibraryDeps;
  #imported: ImportedModel[] = [];
  #found: FoundModel[] = [];
  missing = new Set<string>();
  disk: { total: number; per: Record<string, number> } = { total: 0, per: {} };

  constructor(deps: LibraryDeps) {
    this.#d = deps;
  }

  async init(): Promise<void> {
    this.#imported = await loadImported(this.#d.modelsDir);
    await this.refreshDisk();
  }

  catalog(): readonly SttModel[] {
    return [...STT_MODELS, ...this.#imported.map(importedAsModel)];
  }
  find(id: string): SttModel | undefined {
    return this.catalog().find((m) => m.id === id);
  }

  async refreshDisk(): Promise<void> {
    const use = await diskUse(this.#d.modelsDir, this.catalog());
    this.disk = { total: use.total, per: use.perModel };
    this.missing = new Set((await missingImported(this.#d.modelsDir, this.#imported)).map((m) => m.id));
  }

  async #changed(): Promise<void> {
    await this.#d.models.refresh();
    await this.refreshDisk();
    this.#d.changed();
  }

  /** Deletes the model's file from our folder. An imported model's original stays where it is. Returns the bytes freed. */
  async remove(id: string): Promise<number> {
    const m = this.find(id);
    if (!m) return 0;
    if (this.#d.selected() === id) {
      try {
        await this.#d.unload();
      } catch {
        // nothing is loaded that could hold the file open
      }
    }
    const freed = await deleteModelFiles(this.#d.modelsDir, m);
    if (m.origin === "custom") {
      await removeImported(this.#d.modelsDir, id);
      this.#imported = this.#imported.filter((x) => x.id !== id);
    }
    await this.#changed();
    return freed;
  }

  async importFile(kind: "multilingual" | "english", name: string): Promise<ImportOutcome> {
    const source = await this.#d.pickFile("Choose a speech model file");
    if (!source) return { cancelled: true };
    return this.#import({ source, kind, ...(name.trim() && { name: name.trim() }) });
  }

  /** Points at the file of an imported model whose copy went missing; only the same file (same fingerprint) is accepted. */
  async locate(id: string): Promise<ImportOutcome> {
    const known = this.#imported.find((m) => m.id === id);
    if (!known) return { ok: false, reason: "unknown", message: "That model is not in the list." };
    const source = await this.#d.pickFile(`Find the file of ${known.name}`);
    if (!source) return { cancelled: true };
    return this.#import({ source, expectSha256: known.sha256 });
  }

  async #import(o: { source: string; kind?: "multilingual" | "english"; name?: string; expectSha256?: string }): Promise<ImportOutcome> {
    const r = await importModelFile({ modelsDir: this.#d.modelsDir, ...o, now: this.#d.now });
    if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
    this.#imported = await loadImported(this.#d.modelsDir);
    await this.#changed();
    return { ok: true, id: r.model.id, name: r.model.name, alreadyThere: r.alreadyThere };
  }

  /** Read-only look in the usual folders for files that are exactly one of our models. Nothing is copied until the person says so. */
  async scan(): Promise<FoundView[]> {
    const have = new Set(
      this.catalog()
        .filter((m) => this.#d.models.isInstalled(m.id))
        .map((m) => m.id),
    );
    this.#found = await findModelsOnDisk(
      this.#d.scanDirs(),
      STT_MODELS.filter((m) => !have.has(m.id)),
    );
    return this.#found.map((f) => ({ id: f.id, name: this.find(f.id)?.name ?? f.id, path: f.path }));
  }

  async adopt(ids: string[]): Promise<void> {
    for (const f of this.#found.filter((x) => ids.includes(x.id))) {
      const m = STT_MODELS.find((x) => x.id === f.id);
      if (m) await adoptFound(this.#d.modelsDir, f, m);
    }
    await this.#changed();
  }

  get folder(): string {
    return join(this.#d.modelsDir, "stt");
  }
}
