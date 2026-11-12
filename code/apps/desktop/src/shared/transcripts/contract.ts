import * as v from "valibot";
import type { Detail, Failure, Format, Outcome, Row } from "@speakkit/transcripts/pure";
import { FORMATS } from "@speakkit/transcripts/pure";
import type { TranscriptsMethod } from "./channels";
import { TranscriptsPatchSchema, TRANSCRIPT_LANGUAGES, type TranscriptsConfig, type TranscriptsPatch } from "./settings";

export type { TranscriptsMethod } from "./channels";

export type RecordingPhase = "starting" | "recording" | "saving";

/** The recorder as the window shows it. `silent` is set when the microphone has given no sound for a while. */
export interface RecordingView {
  id: string | null;
  phase: RecordingPhase;
  seconds: number;
  level: number;
  silent: boolean;
  /** Set when a recording ended by itself (microphone gone, disk full, time limit): what happened and that what was recorded is kept. */
  notice?: string;
}

export interface Push {
  recording: RecordingView | null;
  /** Changes with every change to the transcripts, so a window knows to fetch again. */
  tick: number;
  /** Why a recording ended by itself (microphone gone, disk full, time limit); shown until the person closes it or starts another. */
  notice?: string;
}

export type Picked = { ok: true; path: string; name: string; bytes: number } | { ok: false; name: string; failure: Failure };

export interface ModelView {
  name: string;
  installed: boolean;
}

export interface SettingsView {
  config: TranscriptsConfig;
  /** The folder "Save as" writes into, after the default is applied. */
  folder: string;
  model: ModelView;
  storage: { audioBytes: number; count: number; trashed: number };
  /** The manifest came from a newer version (nothing can be changed) or could not be read (it was set aside). */
  notice: { newer: boolean; unreadable?: boolean; recoveredFrom?: string };
  supported: boolean;
}

export interface SavedFile {
  path: string;
  kind: "new" | "replaced" | "copy";
}

export interface TranscriptsBridge {
  list(q?: { search?: string; trashed?: boolean }): Promise<Row[]>;
  get(id: string): Promise<Detail | null>;
  /** Opens the file chooser; null when the person closed it. */
  pickFile(): Promise<Picked | null>;
  /** For a file dropped on the window. */
  checkFile(path: string): Promise<Picked>;
  importFile(a: { path: string; language: string }): Promise<Outcome<{ id: string }>>;
  cancel(id: string): Promise<void>;
  resume(id: string): Promise<Outcome>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  emptyTrash(): Promise<number>;
  copyText(id: string): Promise<boolean>;
  save(id: string, format: Format): Promise<Outcome<SavedFile>>;
  /** Shows a file this app exported in the file manager, selected. */
  reveal(id: string, format: Format): Promise<boolean>;
  deleteAudio(id: string): Promise<void>;
  deleteAllAudio(): Promise<number>;
  recordStart(): Promise<Outcome<{ id: string }>>;
  recordStop(): Promise<Outcome<{ id: string }>>;
  settings(): Promise<SettingsView>;
  patchSettings(patch: TranscriptsPatch): Promise<SettingsView>;
  chooseFolder(): Promise<SettingsView | null>;
  openFolder(): Promise<void>;
  push(): Promise<Push>;
  onPush(cb: (p: Push) => void): () => void;
  /** Path of a dropped File (the page cannot read it). */
  pathOf(file: File): string;
  decoder: {
    onCommand(cb: (c: DecoderCommand) => void): () => void;
    reply(id: number, r: DecoderResult): void;
    ready(): void;
  };
  mic: {
    onCommand(cb: (c: MicCommand) => void): () => void;
    reply(id: number, r: MicResult): void;
    chunk(pcm: Int16Array): void;
    level(n: number): void;
    ended(): void;
    ready(): void;
  };
}

export type DecoderCommand = { id: number; bytes: Uint8Array };
export type DecoderResult = { ok: true; pcm: Int16Array } | { ok: false; code: "decode-failed" | "too-long" | "lost" };
export type MicCommand = { id: number; op: "start" } | { id: number; op: "stop" };
export type MicResult = { ok: true } | { ok: false; code: "mic-denied" | "mic-missing" | "mic-busy" | "mic-failed" };

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const path = v.pipe(v.string(), v.minLength(1), v.maxLength(2048));
const format = v.picklist(FORMATS);

export const TRANSCRIPTS_ARGS = {
  list: v.tuple([v.optional(v.object({ search: v.optional(v.pipe(v.string(), v.maxLength(200))), trashed: v.optional(v.boolean()) }))]),
  get: v.tuple([id]),
  pickFile: v.tuple([]),
  checkFile: v.tuple([path]),
  importFile: v.tuple([v.object({ path, language: v.picklist(TRANSCRIPT_LANGUAGES) })]),
  cancel: v.tuple([id]),
  resume: v.tuple([id]),
  rename: v.tuple([id, v.pipe(v.string(), v.maxLength(400))]),
  trash: v.tuple([id]),
  restore: v.tuple([id]),
  remove: v.tuple([id]),
  emptyTrash: v.tuple([]),
  copyText: v.tuple([id]),
  save: v.tuple([id, format]),
  reveal: v.tuple([id, format]),
  deleteAudio: v.tuple([id]),
  deleteAllAudio: v.tuple([]),
  recordStart: v.tuple([]),
  recordStop: v.tuple([]),
  settings: v.tuple([]),
  patchSettings: v.tuple([TranscriptsPatchSchema]),
  chooseFolder: v.tuple([]),
  openFolder: v.tuple([]),
  push: v.tuple([]),
} as const satisfies Record<TranscriptsMethod, v.GenericSchema<unknown[]>>;

export const DecoderReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.variant("ok", [v.object({ ok: v.literal(true), pcm: v.instance(Int16Array) }), v.object({ ok: v.literal(false), code: v.picklist(["decode-failed", "too-long"]) })]),
]);

export const MicReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.variant("ok", [v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), code: v.picklist(["mic-denied", "mic-missing", "mic-busy", "mic-failed"]) })]),
]);
