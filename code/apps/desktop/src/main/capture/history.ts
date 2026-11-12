import { shell } from "electron";
import path from "node:path";
import type { CaptureDetail, CaptureItem, CopyWhat, RecoveryView } from "../../shared/capture/contract";
import { createBundle, type Bundle } from "./bundle";
import { writeCapture, writeText } from "./clipboard-out";
import { nativeImage } from "electron";
import { journalFs, storeFs } from "./fs-adapters";
import { toDetail, toItem } from "./items";
import { createJournal, type Journal, type JournalEntry } from "./journal";
import { pickKeyframes } from "./keyframes";
import { sweepCaptures, type SweepResult } from "./retention";
import { createStore, type CaptureStore } from "./store";

export interface HistoryDeps {
  /** The folder captures live in now (changes when the person chooses another). */
  folder(): string;
  log(line: string): void;
  now(): number;
  /** Moves a folder to the Recycle Bin (Trash on macOS); defaults to the system call. Tests replace it so nothing lands in the real bin. */
  trash?: ((dir: string) => Promise<void>) | undefined;
}

/** The saved captures: the index, the folders on disk, the journal that finishes interrupted ones, and what can be done with one (copy, reveal, remove, clean up). */
export class History {
  readonly #d: HistoryDeps;
  #folder = "";
  bundle!: Bundle;
  store!: CaptureStore;
  journal!: Journal;
  count = 0;

  constructor(deps: HistoryDeps) {
    this.#d = deps;
    this.open();
  }

  /** Opens the files of the current folder; called again when the folder changes. */
  open() {
    this.#folder = this.#d.folder();
    this.bundle = createBundle(this.#folder);
    this.store = createStore(storeFs, path.join(this.#folder, "index.json"));
    this.journal = createJournal(journalFs, this.#folder);
  }

  get changedFolder(): boolean {
    return this.#d.folder() !== this.#folder;
  }

  #trash(dir: string): Promise<void> {
    return this.#d.trash ? this.#d.trash(dir) : shell.trashItem(dir);
  }

  async refreshCount() {
    this.count = (await this.store.list()).length;
  }

  /** Finishes or removes the captures a crash or a quit left half done. */
  async recover(): Promise<RecoveryView | undefined> {
    const report = await this.journal.recover((entry) => this.#finish(entry));
    return report.finished.length || report.removed.length ? { finished: report.finished.length, removed: report.removed.length } : undefined;
  }

  async #finish(entry: JournalEntry) {
    const plan = pickKeyframes(await this.bundle.frames(entry.id), []);
    await this.store.add({
      id: entry.id,
      kind: "recording",
      title: "Recovered capture",
      at: entry.startedAt,
      dir: entry.id,
      bytes: await this.bundle.bytes(entry.id),
      media: entry.media ?? "",
      frames: plan.frames.map((f) => f.file),
      chips: ["saved"],
    });
  }

  /** Moves captures older than `days` to the Recycle Bin (Trash on macOS); where that is not possible they are deleted, with a log line. */
  sweep(days: number): Promise<SweepResult> {
    return sweepCaptures(days, {
      store: this.store,
      trash: async (dir) => {
        await this.#trash(dir);
        return true;
      },
      removeDir: (dir) => this.bundle.remove(path.basename(dir)),
      resolve: (dir) => path.join(this.#folder, dir),
      log: (line) => this.#d.log(line),
      now: () => this.#d.now(),
    });
  }

  async list(search: string): Promise<{ items: CaptureItem[]; total: number }> {
    const all = await this.store.list();
    const found = search.trim() ? await this.store.list(search) : all;
    return { items: await Promise.all(found.map((r) => toItem(this.bundle, r))), total: all.length };
  }

  async detail(id: string): Promise<CaptureDetail | null> {
    const r = await this.store.get(id);
    return r ? toDetail(this.bundle, r) : null;
  }

  async copy(id: string, what: CopyWhat): Promise<boolean> {
    const r = await this.store.get(id);
    if (!r) return false;
    if (what === "path") await writeText(this.bundle.dir(r.dir));
    else if (what === "text") await writeText(r.words?.map((w) => w.text).join(" ") ?? "");
    else {
      const cover = await this.bundle.readFile(r.dir, r.kind === "screenshot" ? r.media : (r.sheet ?? ""));
      if (!cover) return false;
      await writeCapture("", nativeImage.createFromBuffer(cover));
    }
    if (!r.chips.includes("copied")) await this.store.update(id, { chips: [...r.chips, "copied"] });
    return true;
  }

  async reveal(id: string): Promise<void> {
    const r = await this.store.get(id);
    if (r) shell.showItemInFolder(path.join(this.bundle.dir(r.dir), r.media || "."));
  }

  /** Moves a capture to the Recycle Bin (Trash on macOS); when the system cannot, it is deleted with a log line. */
  async remove(id: string): Promise<void> {
    const [r] = await this.store.remove([id]);
    if (!r) return;
    try {
      await this.#trash(this.bundle.dir(r.dir));
    } catch (e) {
      this.#d.log(`capture ${id}: Recycle Bin not available (${String(e)}), deleted for good`);
      await this.bundle.remove(r.dir);
    }
  }
}
