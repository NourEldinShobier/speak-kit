import { shell } from "electron";
import path from "node:path";
import type { CaptureDetail, EditSource, CaptureItem, CopyWhat, RecoveryView } from "../../shared/capture/contract";
import { canEditFile, editedName, refuseEdit, shownFile } from "./edits";
import { createBundle, type Bundle } from "./bundle";
import { writeCapture, writeText } from "./clipboard-out";
import { nativeImage } from "electron";
import { journalFs, storeFs } from "./fs-adapters";
import { toDetail, toItem } from "./items";
import { createJournal, type Journal, type JournalEntry } from "./journal";
import { pickKeyframes } from "./keyframes";
import { framesIn, trimRange, wordsIn } from "./trim";
import { sweepCaptures, type SweepResult } from "./retention";
import { applyZoom, suggestZoom, type ZoomDeps } from "./zoom";
import { createStore, type CaptureStore } from "./store";

export interface HistoryDeps {
  /** The folder captures live in now (changes when the person chooses another). */
  folder(): string;
  log(line: string): void;
  now(): number;
  /** Moves a folder to the Recycle Bin (Trash on macOS); defaults to the system call. Tests replace it so nothing lands in the real bin. */
  trash?: ((dir: string) => Promise<void>) | undefined;
  /** Builds the contact sheet of a capture from these picture files and writes it as sheet.jpg; undefined when it could not be made. */
  sheet?(id: string, files: readonly string[]): Promise<Buffer | undefined>;
  /** Cuts a recorded video to a range; undefined when it could not be cut. */
  trim?(video: Uint8Array, startMs: number, endMs: number): Promise<Uint8Array | undefined>;
  zoomVideo?: ZoomDeps["zoomVideo"];
  zoomSheet?: ZoomDeps["zoomSheet"];
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
    const frames = await this.bundle.frames(entry.id);
    const plan = pickKeyframes(frames, []);
    const hasVideo = !!(await this.bundle.readFile(entry.id, "video.webm"))?.length;
    await this.store.add({
      id: entry.id,
      kind: "recording",
      title: "Recovered capture",
      at: entry.startedAt,
      dir: entry.id,
      ...(frames.length && { durationMs: frames[frames.length - 1]!.atMs }),
      bytes: await this.bundle.bytes(entry.id),
      media: entry.media ?? (hasVideo ? "video.webm" : (frames[0]?.file ?? "")),
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
      const cover = await this.bundle.readFile(r.dir, r.kind === "screenshot" ? shownFile(r, r.media) : (r.sheet ?? ""));
      if (!cover) return false;
      await writeCapture("", nativeImage.createFromBuffer(cover));
    }
    if (!r.chips.includes("copied")) await this.store.update(id, { chips: [...r.chips, "copied"] });
    return true;
  }

  /** A picture of a capture at full size, to edit. */
  async source(id: string, file: string): Promise<EditSource | null> {
    const r = await this.store.get(id);
    if (!canEditFile(r, file)) return null;
    const buf = await this.bundle.readFile(r.dir, shownFile(r, file));
    const image = buf && nativeImage.createFromBuffer(buf);
    if (!image || image.isEmpty()) return null;
    const { width, height } = image.getSize();
    return { src: image.toDataURL(), width, height };
  }

  /** Saves the edited copy next to the original and points the record at it. For a recording the contact sheet is built again from the shown pictures, so a copy or a send never carries what was blurred out. */
  async saveEdit(id: string, file: string, png: Uint8Array): Promise<boolean> {
    const r = await this.store.get(id);
    if (refuseEdit(r, file, png) || !r) return false;
    const name = editedName(file);
    await this.bundle.writeFile(r.dir, name, png);
    // the record is read again inside the store's queue: an edit of another picture saved meanwhile stays
    const saved = await this.store.mutate(id, (cur) => ({ edits: { ...cur.edits, [file]: name } }));
    if (!saved) {
      await this.bundle.remove(r.dir);
      return false;
    }
    if (saved.kind === "recording") await this.#rebuildSheet(id);
    await this.store.update(id, { bytes: await this.bundle.bytes(r.dir) });
    return true;
  }

  #sheets: Promise<unknown> = Promise.resolve();

  /** One rebuild at a time, each from the record as it is then, so the last one always shows every edit. */
  #rebuildSheet(id: string): Promise<unknown> {
    const run = async () => {
      const cur = await this.store.get(id);
      if (!cur?.sheet || !this.#d.sheet) return;
      try {
        await this.#d.sheet(
          cur.dir,
          cur.frames.map((f) => shownFile(cur, f)),
        );
      } catch (e) {
        this.#d.log(`capture ${id}: the contact sheet could not be rebuilt (${String(e)})`);
      }
    };
    return (this.#sheets = this.#sheets.then(run, run));
  }

  /** Cuts the video of a recording to a range and keeps the cut next to the original. The keyframes, the contact sheet and the words are reduced to what is kept, so nothing cut away is copied or sent. */
  async trim(id: string, startMs: number, endMs: number): Promise<boolean> {
    const r = await this.store.get(id);
    const range = r && trimRange(startMs, endMs, r.durationMs);
    if (!r || !range || r.finishing || r.kind !== "recording" || !this.#d.trim) return false;
    // a recording that followed a switch has more than one video file: it is not cut
    if (await this.bundle.readFile(r.dir, "video-2.webm")) return false;
    const video = await this.bundle.readFile(r.dir, "video.webm");
    if (!video?.length) return false;
    let cut: Uint8Array | undefined;
    try {
      cut = await this.#d.trim(new Uint8Array(video), range.startMs, range.endMs);
    } catch (e) {
      this.#d.log(`capture ${id}: the video could not be cut (${String(e)})`);
    }
    if (!cut?.length) return false;
    await this.bundle.writeFile(r.dir, "video-trim.webm", cut);
    const kept = framesIn(await this.bundle.frames(r.dir), r.words ?? [], range).map((f) => f.file);
    const saved = await this.store.mutate(id, (cur) => ({ media: "video-trim.webm", trim: range, frames: kept, zoom: [], zoomSheet: "", ...(cur.words && { words: wordsIn(cur.words, range) }) }));
    if (!saved) {
      await this.bundle.remove(r.dir);
      return false;
    }
    await this.#rebuildSheet(id);
    await this.store.update(id, { bytes: await this.bundle.bytes(r.dir) });
    return true;
  }

  #zoomDeps(): ZoomDeps {
    const { zoomVideo, zoomSheet } = this.#d;
    return { store: this.store, bundle: this.bundle, log: this.#d.log, ...(zoomVideo && { zoomVideo }), ...(zoomSheet && { zoomSheet }) };
  }

  /** Shows parts of the video closer and keeps the result next to the original; no parts puts the video back as it was. */
  zoom(id: string, regions: Parameters<typeof applyZoom>[2]): Promise<boolean> {
    return applyZoom(this.#zoomDeps(), id, regions);
  }

  suggestZoom(id: string) {
    return suggestZoom(this.#zoomDeps(), id);
  }

  /** The capture was handed to the voice chat: the list shows it. */
  async markSent(id: string): Promise<void> {
    // mutate, not get + update: an Undo right after the send queues its unmark behind this, so the chip cannot come back after it was taken away
    await this.store.mutate(id, (r) => ({ chips: r.chips.includes("sent") ? r.chips : [...r.chips, "sent"] }));
  }

  /** The capture was taken back from the voice chat. */
  async unmarkSent(id: string): Promise<void> {
    await this.store.mutate(id, (r) => ({ chips: r.chips.filter((c) => c !== "sent") }));
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
