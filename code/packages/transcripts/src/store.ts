import path from "node:path";
import type { Fs } from "./fs";
import type { Entry, Segment } from "./types";

const VERSION = 1;

export class StoreError extends Error {
  readonly code: "newer-version" | "unreadable" | "not-found";
  constructor(code: "newer-version" | "unreadable" | "not-found", message: string) {
    super(message);
    this.code = code;
  }
}

export interface StoreOptions {
  dir: string;
  fs: Fs;
  newId(): string;
  now(): number;
}

export interface NewEntry extends Partial<Omit<Entry, "createdAt">> {
  title: string;
  source: Entry["source"];
}

/**
 * The transcripts on disk: `manifest.json` (one row per transcript), `items/<id>.json` (the words) and `audio/<id>.wav`. Every write goes to a temporary file first
 * and is committed in memory only after it landed, so a failed write (disk full) leaves the store as it was. Writes run one at a time.
 */
export class Store {
  readonly #o: StoreOptions;
  #entries = new Map<string, Entry>();
  #chain: Promise<unknown> = Promise.resolve();
  /** The manifest was written by a newer version: it is read but never rewritten. */
  newer = false;
  /** Where an unreadable manifest was moved to; undefined when it was fine. */
  recoveredFrom: string | undefined;
  /** The manifest exists but could not be read (locked, no permission): nothing is written so it is not replaced. */
  unreadable = false;

  constructor(o: StoreOptions) {
    this.#o = o;
  }

  #p = (...parts: string[]) => path.join(this.#o.dir, ...parts);

  async open(): Promise<void> {
    let raw: Uint8Array | undefined;
    try {
      raw = await this.#o.fs.read(this.#p("manifest.json"));
    } catch {
      this.unreadable = true;
      return;
    }
    if (!raw) return;
    let parsed: { version?: unknown; entries?: unknown };
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw));
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error("not a manifest");
    } catch {
      this.recoveredFrom = this.#p(`manifest.bad-${this.#o.now()}.json`);
      await this.#o.fs.rename(this.#p("manifest.json"), this.recoveredFrom);
      return;
    }
    this.newer = typeof parsed.version === "number" && parsed.version > VERSION;
    let changed = false;
    for (const e of parsed.entries as Entry[]) {
      if (!e || typeof e.id !== "string") continue;
      // Work that was running when the app stopped is not lost: it waits to be resumed (a recording is kept as what was spooled).
      if (e.status === "transcribing" || e.status === "queued") {
        e.status = "interrupted";
        changed = true;
      } else if (e.status === "recording") {
        e.status = "interrupted";
        e.recovered = true;
        changed = true;
      }
      this.#entries.set(e.id, e);
    }
    if (changed && !this.newer) await this.#commit(new Map(this.#entries));
  }

  list(trashed = false): Entry[] {
    return [...this.#entries.values()].filter((e) => !!e.trashedAt === trashed).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): Entry | undefined {
    return this.#entries.get(id);
  }

  #serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#chain.then(task, task);
    this.#chain = run.catch(() => {});
    return run;
  }

  async #commit(next: Map<string, Entry>): Promise<void> {
    if (this.unreadable) throw new StoreError("unreadable", "The list of transcripts could not be opened.");
    if (this.newer) throw new StoreError("newer-version", "This data was saved by a newer version of Speak Kit.");
    await this.#o.fs.write(this.#p("manifest.json"), JSON.stringify({ version: VERSION, entries: [...next.values()] }));
    this.#entries = next;
  }

  #mutate(fn: (draft: Map<string, Entry>) => void): Promise<void> {
    return this.#serial(() => {
      const draft = new Map([...this.#entries].map(([k, e]) => [k, structuredClone(e)]));
      fn(draft);
      return this.#commit(draft);
    });
  }

  async add(n: NewEntry): Promise<Entry> {
    const entry: Entry = {
      durationSec: 0,
      language: "auto",
      model: "",
      status: "queued",
      chunksDone: 0,
      chunksTotal: 0,
      audioBytes: 0,
      exports: [],
      ...n,
      id: n.id ?? this.#o.newId(),
      createdAt: this.#o.now(),
    };
    await this.#mutate((d) => void d.set(entry.id, entry));
    return structuredClone(entry);
  }

  /** A key set to `undefined` is removed from the entry. */
  async update(id: string, patch: { [K in keyof Omit<Entry, "id">]?: Entry[K] | undefined }): Promise<Entry> {
    if (!this.#entries.has(id)) throw new StoreError("not-found", "That transcript is gone.");
    await this.#mutate((d) => {
      const cur = d.get(id);
      if (!cur) return;
      const next: Record<string, unknown> = { ...cur, ...patch };
      for (const k of Object.keys(patch)) if (next[k] === undefined) delete next[k];
      d.set(id, next as unknown as Entry);
    });
    return structuredClone(this.#entries.get(id)!);
  }

  async saveSegments(id: string, segments: Segment[]): Promise<void> {
    await this.#serial(() => this.#o.fs.write(this.#p("items", `${id}.json`), JSON.stringify({ segments })));
  }

  async segments(id: string): Promise<Segment[]> {
    const raw = await this.#o.fs.read(this.#p("items", `${id}.json`));
    if (!raw) return [];
    try {
      const { segments } = JSON.parse(new TextDecoder().decode(raw)) as { segments?: Segment[] };
      return Array.isArray(segments) ? segments : [];
    } catch {
      return [];
    }
  }

  /** Raw 16 kHz 16-bit samples of a recording still in progress. */
  spoolPath(id: string): string {
    return this.#p("audio", `${id}.raw`);
  }

  audioPath(id: string): string {
    return this.#p("audio", `${id}.wav`);
  }

  newId(): string {
    return this.#o.newId();
  }

  /** Writes the audio file only; the entry may not exist yet (it is added after, so a full disk leaves nothing behind). */
  writeAudio(id: string, wav: Uint8Array): Promise<void> {
    return this.#serial(() => this.#o.fs.write(this.audioPath(id), wav));
  }

  async putAudio(id: string, wav: Uint8Array): Promise<void> {
    await this.writeAudio(id, wav);
    await this.update(id, { audioBytes: wav.byteLength });
  }

  /** Changes the entry in memory only, for a state that could not be written (a full disk). The last written state is what the next start sees. */
  patchMemory(id: string, patch: { [K in keyof Omit<Entry, "id">]?: Entry[K] | undefined }): void {
    const cur = this.#entries.get(id);
    if (!cur) return;
    const next: Record<string, unknown> = { ...cur, ...patch };
    for (const k of Object.keys(patch)) if (next[k] === undefined) delete next[k];
    this.#entries.set(id, next as unknown as Entry);
  }

  readAudio(id: string): Promise<Uint8Array | undefined> {
    return this.#o.fs.read(this.audioPath(id));
  }

  async dropAudio(id: string): Promise<void> {
    await this.#serial(() => this.#o.fs.remove(this.audioPath(id)));
    if (this.#entries.has(id)) await this.update(id, { audioBytes: 0, audioRemovedAt: this.#o.now() });
  }

  async trash(id: string): Promise<void> {
    if (!this.#entries.has(id)) throw new StoreError("not-found", "That transcript is gone.");
    const at = this.#o.now();
    await this.#mutate((d) => {
      const e = d.get(id);
      if (e && !e.trashedAt) e.trashedAt = at;
    });
  }

  async restore(id: string): Promise<void> {
    if (!this.#entries.has(id)) throw new StoreError("not-found", "That transcript is gone.");
    await this.#mutate((d) => {
      const e = d.get(id);
      if (e) delete e.trashedAt;
    });
  }

  /** Deletes the transcript, its words and its audio for good. The manifest row goes first: a crash in between leaves orphan files, never a row without data. */
  async remove(id: string): Promise<void> {
    if (!this.#entries.has(id)) return;
    await this.#mutate((d) => void d.delete(id));
    await this.#serial(async () => {
      await this.#o.fs.remove(this.#p("items", `${id}.json`));
      await this.#o.fs.remove(this.audioPath(id));
      await this.#o.fs.remove(this.spoolPath(id));
    });
  }

  async emptyTrash(): Promise<number> {
    const ids = this.list(true).map((e) => e.id);
    for (const id of ids) await this.remove(id);
    return ids.length;
  }
}

export const openStore = async (o: StoreOptions): Promise<Store> => {
  const s = new Store(o);
  await s.open();
  return s;
};
