import type { Fs } from "./fs";
import type { JobDeps } from "./job";
import type { NotesState, NotesView, Summarise } from "./notes";
import type { Failure, Segment, Status } from "./types";

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
  /** Something a window should redraw. */
  changed(): void;
  /** Sends a file to the OS recycle bin. When absent, or when it throws, the file is not recycled. */
  recycle?(file: string): Promise<void>;
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
  sourceName?: string;
  language: string;
  status: Status;
  chunksDone: number;
  chunksTotal: number;
  failure?: Failure;
  audioBytes: number;
  audioRemoved: boolean;
  /** Whole days until the transcript is deleted. */
  daysLeft: number;
  /** Place in the waiting line; 0 is running now. */
  queued?: number;
  /** For a search: the words around the first match. */
  snippet?: string;
  /** Where the notes are: being written, written or failed. Absent when none were ever asked for. */
  notesState?: NotesState;
}

export interface Detail extends Row {
  segments: Segment[];
  notes?: NotesView;
}

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; failure: Failure };

export interface Transcripts {
  readonly ready: Promise<void>;
  /** Set when the manifest was written by a newer version (nothing can be changed) or could not be read (it was moved aside). */
  notice(): { newer: boolean; unreadable?: boolean; recoveredFrom?: string };
  list(o?: { search?: string }): Row[];
  get(id: string): Promise<Detail | undefined>;
  importAudio(a: { name: string; pcm: Int16Array; language: string }): Promise<Outcome<{ id: string }>>;
  /** Continues an interrupted, cancelled or failed job after the chunks already done. */
  resume(id: string): Promise<Outcome>;
  cancel(id: string): Promise<void>;
  /** Writes the notes again. The words and the audio are never touched; a failure keeps the notes written before. */
  writeNotes(id: string): Promise<Outcome>;
  rename(id: string, title: string): Promise<void>;
  /** Deletes the transcript, its words and its audio for good. */
  remove(id: string): Promise<void>;
  /** Deletes the audio of one transcript (the words stay). */
  dropAudio(id: string): Promise<void>;
  /** Deletes all audio; returns how many transcripts had some. */
  dropAllAudio(): Promise<number>;
  /** Applies the retention rules now. */
  sweep(): Promise<{ removed: number; audioDropped: number }>;
  storage(): { audioBytes: number; count: number };
  /** Stops the running job so it can resume at the next start, and waits for it to be saved. */
  dispose(): Promise<void>;
}
