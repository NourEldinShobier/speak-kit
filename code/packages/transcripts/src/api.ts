import type { Format } from "./export";
import type { Saved } from "./files";
import type { Fs } from "./fs";
import type { JobDeps } from "./job";
import type { NotesState, NotesView, Summarise } from "./notes";
import type { Policy } from "./retention";
import type { ExportedFile, Failure, Segment, Source, Status } from "./types";

export interface TranscriptsDeps {
  dir: string;
  fs: Fs;
  now(): number;
  newId(): string;
  /** The engine, one chunk at a time. */
  transcribe: JobDeps["transcribe"];
  /** True while dictation uses the engine; background jobs wait. */
  busy(): boolean;
  sleep(ms: number): Promise<void>;
  /** The speech model that will be used, for the record. */
  model(): string;
  policy(): Policy;
  /** The folder "Save as" writes into. */
  exportDir(): string;
  /** Something a window should redraw. */
  changed(): void;
  /** Sends a file to the OS recycle bin. When absent, or when it throws, the file is not recycled. */
  recycle?(file: string): Promise<void>;
  /** Tells the person about something that could not be done on a file. */
  warn?(message: string): void;
  /** The notes writer, or nothing when notes are off or there is no key. Asked each time a transcript finishes and each time notes are regenerated. */
  notes?(): Summarise | undefined;
  deadlineMs?: JobDeps["deadlineMs"];
  chunks?: JobDeps["chunks"];
}

export interface Row {
  id: string;
  title: string;
  createdAt: number;
  durationSec: number;
  source: Source;
  sourceName?: string;
  language: string;
  status: Status;
  chunksDone: number;
  chunksTotal: number;
  failure?: Failure;
  recovered?: boolean;
  audioBytes: number;
  audioRemoved: boolean;
  daysLeft: number | null;
  /** Place in the waiting line; 0 is running now. */
  queued?: number;
  /** For a search: the words around the first match. */
  snippet?: string;
  /** Where the notes are: being written, written or failed. Absent when none were ever asked for. */
  notesState?: NotesState;
}

export interface Detail extends Row {
  segments: Segment[];
  /** Files this app exported for it, with the hash recorded at the time. */
  exports: ExportedFile[];
  notes?: NotesView;
}

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; failure: Failure };

export interface Transcripts {
  readonly ready: Promise<void>;
  /** Set when the manifest was written by a newer version (nothing can be changed) or could not be read (it was moved aside). */
  notice(): { newer: boolean; unreadable?: boolean; recoveredFrom?: string };
  list(o?: { search?: string; trashed?: boolean }): Row[];
  get(id: string): Promise<Detail | undefined>;
  importAudio(a: { name: string; pcm: Int16Array; language: string }): Promise<Outcome<{ id: string }>>;
  beginRecording(language: string): Promise<Outcome<{ id: string }>>;
  appendRecording(id: string, pcm: Int16Array): Promise<Outcome<{ seconds: number }>>;
  finishRecording(id: string): Promise<Outcome<{ id: string }>>;
  discardRecording(id: string): Promise<void>;
  /** Continues an interrupted, cancelled or failed job after the chunks already done; a recovered recording is first turned into audio. */
  resume(id: string): Promise<Outcome>;
  cancel(id: string): Promise<void>;
  /** Writes the notes again. The words and the audio are never touched; a failure keeps the notes written before. */
  writeNotes(id: string): Promise<Outcome>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  emptyTrash(): Promise<number>;
  text(id: string, format: Format): Promise<{ name: string; text: string } | undefined>;
  save(id: string, format: Format): Promise<Outcome<Saved>>;
  /** Deletes the audio of one transcript (the words stay). */
  dropAudio(id: string): Promise<void>;
  /** Deletes all audio; returns how many transcripts had some. */
  dropAllAudio(): Promise<number>;
  /** Applies the retention settings now. */
  sweep(): Promise<{ trashed: number; removed: number; audioDropped: number }>;
  storage(): { audioBytes: number; count: number; trashed: number };
  /** Stops the running job so it can resume at the next start, and waits for it to be saved. */
  dispose(): Promise<void>;
}
