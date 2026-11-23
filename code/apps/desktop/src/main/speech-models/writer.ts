import { DownloadError, WRITER_MODEL, adoptFound, deleteModelFiles, diskUse, findModelsOnDisk, type LocalWriter, type Transfers, type WriterModel } from "@speakkit/engine";
import type { WriterCard } from "../../shared/speech-models/contract";

export interface WriterModelsDeps {
  modelsDir: string;
  writer: Pick<LocalWriter, "downloaded" | "download" | "unload">;
  /** The transfers of the speech models: pause, resume and cancel by id work for the writer's download too. */
  transfers: Transfers;
  /** Folders to look in for a copy of the model file that is already on this computer. */
  scanDirs(): string[];
  changed(): void;
  /** Injectable for tests: replaces the catalog file. */
  model?: WriterModel;
}

/** The file of the rewrite pass's writer on disk: what it takes, downloading it (resumable, one transfer), taking in a copy found elsewhere, and deleting it. */
export class WriterModels {
  readonly #d: WriterModelsDeps;
  readonly #m: WriterModel;
  #installed = false;
  #diskBytes = 0;
  #failure: DownloadError | undefined;

  constructor(deps: WriterModelsDeps) {
    this.#d = deps;
    this.#m = deps.model ?? WRITER_MODEL;
  }

  get installed(): boolean {
    return this.#installed;
  }

  async refresh(): Promise<void> {
    this.#installed = await this.#d.writer.downloaded();
    this.#diskBytes = (await diskUse(this.#d.modelsDir, [this.#m])).total;
  }

  /** Reads what is on disk, then copies a finished file found in the usual folders into ours (a copy that fails is downloaded as usual). */
  async init(): Promise<void> {
    await this.refresh();
    if (!this.#installed) {
      const [found] = await findModelsOnDisk(this.#d.scanDirs(), [this.#m]);
      try {
        if (found) await adoptFound(this.#d.modelsDir, found, this.#m);
      } catch {
        // a copy that cannot be made (disk full, file in use) leaves the model to be downloaded as usual
      }
      await this.refresh();
    }
    this.#d.changed();
  }

  /** Resolves when the file is complete; a second call joins the transfer that runs. A cancelled or failed download resolves too: the card says what happened. */
  async download(): Promise<void> {
    this.#failure = undefined;
    try {
      await this.#d.transfers.start(this.#m.id, ({ signal, progress }) => this.#d.writer.download({ signal, progress }));
    } catch (e) {
      if (e instanceof DownloadError) this.#failure = e;
    }
    await this.refresh();
    this.#d.changed();
  }

  /** Deletes the file and its partial download. Returns the bytes freed. */
  async remove(): Promise<number> {
    this.#d.transfers.cancel(this.#m.id);
    await this.#d.writer.unload();
    const freed = await deleteModelFiles(this.#d.modelsDir, this.#m);
    this.#failure = undefined;
    await this.refresh();
    this.#d.changed();
    return freed;
  }

  card(): WriterCard {
    const { id, name, description, bytes, license } = this.#m;
    const t = this.#d.transfers.get(id);
    const f = this.#failure;
    return {
      id,
      name,
      description,
      bytes,
      license,
      installed: this.#installed,
      diskBytes: this.#diskBytes,
      ...(t && { transfer: { state: t.state, fraction: t.fraction, ...(t.etaSeconds !== undefined && { etaSeconds: t.etaSeconds }) } }),
      ...(f && { failure: { kind: f.kind, message: f.message, host: f.host, keptBytes: f.keptBytes, advice: f.advice } }),
    };
  }
}
