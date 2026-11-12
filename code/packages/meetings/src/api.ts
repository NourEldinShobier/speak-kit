import { DiskFullError, type Fs, type runJob } from "@speakkit/transcripts";
import type { Since } from "./events";
import type { NotesDeps, VocabEntry } from "./notes";
import type { Retention } from "./retention";
import type { Line, MeetingEntry, NoteVersion, StoreNotice } from "./store";
import type { TrackName } from "./tracks";
import type { Failure } from "./types";

type JobDeps = Parameters<typeof runJob>[0];

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; failure: Failure };

export interface MeetingsDeps {
  /** Where meetings live: `manifest.json`, `events.json` and one folder per meeting. */
  dir: string;
  fs: Fs;
  now(): number;
  newId(): string;
  sleep(ms: number): Promise<void>;
  /** The engine, one chunk at a time. */
  transcribe: JobDeps["transcribe"];
  /** Dictation uses the engine; transcription waits for it. */
  busy(): boolean;
  retention(): Retention;
  /** The notes pass; undefined when the person did not opt in (or there is no key). */
  notes(): NotesDeps | undefined;
  vocabulary(): VocabEntry[];
  language(): string;
  /** Words given to the model as hints; output that only repeats them is dropped. */
  hints?(): string[];
  /** The person wears headphones: the microphone cannot hear the call, so no echo is removed. */
  headphones(): boolean;
  /** The folder "files" are written into. */
  exportDir(): string;
  /** Something a window should redraw. */
  changed(): void;
  /** A speech check for one chunk; defaults to the loudness check. */
  hasSpeech?(pcm: Int16Array): boolean;
}

export interface Row {
  id: string;
  title: string;
  titleTemporary: boolean;
  providerId: string;
  providerName: string;
  startedAt: number;
  durationSec: number;
  status: MeetingEntry["status"];
  failure?: Failure;
  notes: MeetingEntry["notes"];
  /** "Audio removed in 23 h"; undefined when there is nothing to say. */
  audio?: string;
  audioBytes: number;
  /** Whole days until the transcript moves to the Trash (or is deleted from it). */
  daysLeft: number | null;
  trashed: boolean;
  snippet?: string;
}

export interface Detail extends Row {
  lines: Line[];
  versions: NoteVersion[];
  files: string[];
}

export interface Meetings {
  notice(): StoreNotice;
  list(o?: { search?: string; trashed?: boolean }): Row[];
  get(id: string): Promise<Detail | undefined>;
  begin(a: { providerId: string; providerName: string; title?: string }): Promise<Outcome<{ id: string }>>;
  append(id: string, track: TrackName, pcm: Int16Array, atSec: number): Promise<Outcome>;
  /** Stops the recording: finishes the audio, then transcribes and writes notes in the background. */
  end(id: string): Promise<Outcome<{ id: string }>>;
  /** Transcribes again from the saved audio (a failed or interrupted meeting). */
  retry(id: string): Promise<Outcome>;
  regenerateNotes(id: string): Promise<Outcome>;
  /** Applies the vocabulary to the notes as a new version; the transcript and earlier versions stay. */
  applyVocabulary(id: string): Promise<Outcome<{ changed: number }>>;
  /** The lines not copied yet, as text; empty when nothing is new. */
  copyNew(id: string): Promise<string>;
  text(id: string, labels?: boolean): Promise<string | undefined>;
  /** Writes the transcript and the notes as files in the export folder; names are cleaned and never overwrite a file. */
  writeFiles(id: string): Promise<Outcome<{ paths: string[] }>>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** Deletes the meeting and every file of it, whatever its state (a failed one included). */
  remove(id: string): Promise<void>;
  sweep(): Promise<{ trashed: number; removed: number; audioDropped: number }>;
  since(seq: number, limit?: number): Since;
  ack(consumer: string, seq: number): Promise<void>;
  /** The vocabulary changed: the search finds both spellings. */
  vocabularyChanged(): void;
  highlights(text: string, query: string): { from: number; to: number }[];
  dispose(): Promise<void>;
}

export const failure = (e: unknown, fallback: Failure): Failure => (e instanceof DiskFullError ? { code: "disk-full", message: "The disk is full. Free some space and try again." } : fallback);
export const FAILED: Failure = { code: "failed", message: "Something went wrong with this meeting. The audio recorded so far is kept." };
export const NOTHING: Failure = { code: "nothing-recorded", message: "No audio was recorded." };

const two = (n: number) => String(n).padStart(2, "0");
/** The title of a meeting until the notes name it: the app and the start time. */
export const temporaryTitle = (app: string, at: number): string => {
  const d = new Date(at);
  return `${app} · ${two(d.getHours())}:${two(d.getMinutes())}`;
};
