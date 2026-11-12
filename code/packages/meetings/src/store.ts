import type { Fs, Segment } from "@speakkit/transcripts";
import type { TrackFiles, TrackName } from "./tracks";
import type { Failure } from "./types";

/** Version of every bundle this app writes: the manifest, the transcript file and the notes file. */
export const BUNDLE_VERSION = 1;

export type MeetingStatus = "recording" | "saving" | "transcribing" | "done" | "failed" | "interrupted";
export type NotesState = "off" | "writing" | "done" | "failed";
export type Who = "You" | "Them";

export interface MeetingEntry {
  id: string;
  title: string;
  /** True while the title is the app and the start time; the notes pass replaces it. */
  titleTemporary: boolean;
  providerId: string;
  providerName: string;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  status: MeetingStatus;
  failure?: Failure;
  /** Bytes of each track's WAV file; 0 when nothing was recorded or the audio was removed. */
  audio: { you: number; them: number };
  audioRemovedAt?: number;
  notes: { state: NotesState; failure?: Failure; chapters: number };
  trashedAt?: number;
  /** Files written next to the audio on request, by name. */
  exports: string[];
}

export interface Line extends Segment {
  who: Who;
}

export interface TranscriptFile {
  v: number;
  lines: Line[];
}

/** One saved state of the notes: the writer's output, or the same text with the vocabulary applied. The raw transcript is never one of these. */
export interface NoteVersion {
  n: number;
  at: number;
  kind: "summary" | "vocabulary";
  title: string;
  summary: string;
  chapters: { start: number; title: string; text: string }[];
  /** Who wrote it: a model name, or "Vocabulary". */
  writer: string;
}

export interface NotesFile {
  v: number;
  versions: NoteVersion[];
}

export interface StoreNotice {
  /** Written by a newer version: read, never rewritten. */
  newer: boolean;
  /** The manifest could not be parsed; it was moved aside under this name and a new one started. */
  recoveredFrom?: string;
}

export interface StoreOptions {
  dir: string;
  fs: Fs;
  now(): number;
}

const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const opt = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const STATUSES: readonly string[] = ["recording", "saving", "transcribing", "done", "failed", "interrupted"];
const NOTES: readonly string[] = ["off", "writing", "done", "failed"];

function failureOf(x: unknown): Failure | undefined {
  const o = x as { code?: unknown; message?: unknown } | null;
  return o && typeof o === "object" && typeof o.message === "string" ? { code: str(o.code, "failed"), message: o.message } : undefined;
}

/** One manifest row from whatever is on disk: nulls, missing and mistyped fields take defaults, fields this version does not know are kept as they were. Null when there is no id. */
export function readEntry(raw: unknown): MeetingEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return undefined;
  const audio = (r.audio ?? {}) as Record<string, unknown>;
  const notes = (r.notes ?? {}) as Record<string, unknown>;
  const status = str(r.status);
  const failure = failureOf(r.failure);
  const nf = failureOf(notes.failure);
  const endedAt = opt(r.endedAt);
  const audioRemovedAt = opt(r.audioRemovedAt);
  const trashedAt = opt(r.trashedAt);
  const known = { ...r };
  for (const k of ["endedAt", "audioRemovedAt", "trashedAt", "failure"]) delete known[k];
  return {
    ...known,
    id,
    title: str(r.title, "Meeting"),
    titleTemporary: r.titleTemporary === true,
    providerId: str(r.providerId, "unknown"),
    providerName: str(r.providerName, "Call"),
    startedAt: num(r.startedAt),
    ...(endedAt !== undefined && { endedAt }),
    durationSec: num(r.durationSec),
    status: (STATUSES.includes(status) ? status : "failed") as MeetingStatus,
    ...(failure && { failure }),
    audio: { you: num(audio.you), them: num(audio.them) },
    ...(audioRemovedAt !== undefined && { audioRemovedAt }),
    notes: { state: (NOTES.includes(str(notes.state)) ? str(notes.state) : "off") as NotesState, ...(nf && { failure: nf }), chapters: num(notes.chapters) },
    ...(trashedAt !== undefined && { trashedAt }),
    exports: Array.isArray(r.exports) ? r.exports.filter((e): e is string => typeof e === "string") : [],
  } as MeetingEntry;
}

/**
 * The meetings on disk, with one writer. `manifest.json` holds one row per meeting; each meeting has its own folder with its audio tracks, `transcript.json`
 * and `notes.json`. Every file goes to disk whole (the file system adapter writes to a temporary name and renames), changes run one at a time through `mutate`
 * so a read-then-write never works on a stale copy, and a manifest that cannot be understood is kept under a new name instead of being overwritten.
 */
export class MeetingStore {
  readonly #o: StoreOptions;
  #entries = new Map<string, MeetingEntry>();
  #chain: Promise<unknown> = Promise.resolve();
  notice: StoreNotice = { newer: false };

  constructor(o: StoreOptions) {
    this.#o = o;
  }

  static async open(o: StoreOptions): Promise<MeetingStore> {
    const s = new MeetingStore(o);
    await s.#load();
    return s;
  }

  get manifest(): string {
    return `${this.#o.dir}/manifest.json`;
  }

  folder(id: string): string {
    return `${this.#o.dir}/${id}`;
  }

  files(id: string): TrackFiles {
    const dir = this.folder(id);
    return { spool: (t: TrackName) => `${dir}/${t}.pcm`, wav: (t: TrackName) => `${dir}/${t}.wav` };
  }

  async #load(): Promise<void> {
    const { fs } = this.#o;
    let raw: Uint8Array | undefined;
    try {
      raw = await fs.read(this.manifest);
    } catch {
      // Cannot be read now (locked): work from nothing but never write, so what is there is not replaced.
      this.notice = { newer: true };
      return;
    }
    if (!raw) return;
    try {
      const doc = JSON.parse(new TextDecoder().decode(raw)) as { v?: unknown; entries?: unknown };
      if (num(doc.v, 1) > BUNDLE_VERSION) this.notice = { newer: true };
      for (const e of Array.isArray(doc.entries) ? doc.entries : []) {
        const entry = readEntry(e);
        if (entry) this.#entries.set(entry.id, entry);
      }
    } catch {
      const aside = `${this.#o.dir}/manifest.invalid-${this.#o.now()}.json`;
      try {
        await fs.write(aside, raw);
        this.notice = { newer: false, recoveredFrom: aside };
      } catch {
        this.notice = { newer: true };
      }
    }
  }

  list(): MeetingEntry[] {
    return [...this.#entries.values()].sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? 1 : -1));
  }

  get(id: string): MeetingEntry | undefined {
    return this.#entries.get(id);
  }

  /** A change the disk refused: the window still shows it, and the last saved state is what the next start finds. */
  patchMemory(id: string, p: Partial<MeetingEntry>): void {
    const e = this.#entries.get(id);
    if (e) this.#entries.set(id, { ...e, ...p });
  }

  /** Runs `fn` alone: nothing else changes the manifest until it settled. The result of `fn` is what the caller gets; the manifest is written once afterwards. */
  mutate<T>(fn: (entries: Map<string, MeetingEntry>) => T | Promise<T>): Promise<T> {
    const run = this.#chain.then(async () => {
      if (this.notice.newer) throw new Error("The meetings were saved by a newer version and are not changed.");
      const before = new Map(this.#entries);
      let out: T;
      try {
        out = await fn(this.#entries);
        await this.#save();
      } catch (e) {
        this.#entries = before;
        throw e;
      }
      return out;
    });
    this.#chain = run.catch(() => {});
    return run;
  }

  async #save(): Promise<void> {
    const doc = { v: BUNDLE_VERSION, entries: [...this.#entries.values()] };
    await this.#o.fs.write(this.manifest, JSON.stringify(doc));
  }

  /** The words of a meeting, or none when the file is missing or unreadable. */
  async transcript(id: string): Promise<Line[]> {
    const raw = await this.#o.fs.read(`${this.folder(id)}/transcript.json`).catch(() => undefined);
    if (!raw) return [];
    try {
      const doc = JSON.parse(new TextDecoder().decode(raw)) as { lines?: unknown };
      return (Array.isArray(doc.lines) ? doc.lines : []).flatMap((l: Record<string, unknown> | null) =>
        l && typeof l.text === "string" ? [{ start: num(l.start), end: num(l.end), text: l.text, who: l.who === "You" ? ("You" as const) : ("Them" as const) }] : [],
      );
    } catch {
      return [];
    }
  }

  /** Only the transcription writes this file, and it always writes all of it. */
  putTranscript(id: string, lines: readonly Line[]): Promise<void> {
    const doc: TranscriptFile = { v: BUNDLE_VERSION, lines: [...lines] };
    return this.#o.fs.write(`${this.folder(id)}/transcript.json`, JSON.stringify(doc));
  }

  async notes(id: string): Promise<NoteVersion[]> {
    const raw = await this.#o.fs.read(`${this.folder(id)}/notes.json`).catch(() => undefined);
    if (!raw) return [];
    try {
      const doc = JSON.parse(new TextDecoder().decode(raw)) as { versions?: unknown };
      return (Array.isArray(doc.versions) ? doc.versions : []).filter((x): x is NoteVersion => !!x && typeof x === "object" && typeof (x as NoteVersion).summary === "string");
    } catch {
      return [];
    }
  }

  /** Adds a version; earlier ones stay. */
  async addNotes(id: string, v: Omit<NoteVersion, "n">): Promise<NoteVersion> {
    const all = await this.notes(id);
    const next: NoteVersion = { ...v, n: (all.at(-1)?.n ?? 0) + 1 };
    const doc: NotesFile = { v: BUNDLE_VERSION, versions: [...all, next] };
    await this.#o.fs.write(`${this.folder(id)}/notes.json`, JSON.stringify(doc));
    return next;
  }

  async removeFiles(id: string, only?: readonly string[]): Promise<void> {
    const names = only ?? ["you.wav", "them.wav", "you.pcm", "them.pcm", "transcript.json", "notes.json"];
    for (const n of names) await this.#o.fs.remove(`${this.folder(id)}/${n}`);
  }
}
