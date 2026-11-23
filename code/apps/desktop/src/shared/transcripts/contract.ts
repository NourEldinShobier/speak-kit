import * as v from "valibot";
import type { Detail, Failure, Outcome, Row } from "@speakkit/transcripts/pure";
import type { TranscriptsMethod } from "./channels";
import { TranscriptsPatchSchema, TRANSCRIPT_LANGUAGES, type TranscriptsConfig, type TranscriptsPatch } from "./settings";

export type { TranscriptsMethod } from "./channels";

export interface Push {
  /** Changes with every change to the transcripts, so a window knows to fetch again. */
  tick: number;
}

export type Picked = { ok: true; path: string; name: string; bytes: number } | { ok: false; name: string; failure: Failure };

export interface ModelView {
  name: string;
  installed: boolean;
}

export interface SettingsView {
  config: TranscriptsConfig;
  model: ModelView;
  storage: { audioBytes: number; count: number };
  /** The manifest came from a newer version (nothing can be changed) or could not be read (it was set aside). */
  notice: { newer: boolean; unreadable?: boolean; recoveredFrom?: string };
  supported: boolean;
}

export interface TranscriptsBridge {
  list(q?: { search?: string }): Promise<Row[]>;
  get(id: string): Promise<Detail | null>;
  /** Opens the file chooser; null when the person closed it. */
  pickFile(): Promise<Picked | null>;
  /** For a file dropped on the window. */
  checkFile(path: string): Promise<Picked>;
  importFile(a: { path: string; language: string }): Promise<Outcome<{ id: string }>>;
  cancel(id: string): Promise<void>;
  resume(id: string): Promise<Outcome>;
  /** Writes the notes again; the transcript is never changed by it. */
  writeNotes(id: string): Promise<Outcome>;
  rename(id: string, title: string): Promise<void>;
  /** Deletes the transcript, its words and its audio for good. */
  remove(id: string): Promise<void>;
  /** Copies the words said from `from` up to `to` seconds (a chapter). */
  copyText(id: string, range: { from: number; to: number }): Promise<boolean>;
  deleteAudio(id: string): Promise<void>;
  deleteAllAudio(): Promise<number>;
  settings(): Promise<SettingsView>;
  patchSettings(patch: TranscriptsPatch): Promise<SettingsView>;
  push(): Promise<Push>;
  onPush(cb: (p: Push) => void): () => void;
  /** Path of a dropped File (the page cannot read it). */
  pathOf(file: File): string;
  decoder: {
    onCommand(cb: (c: DecoderCommand) => void): () => void;
    reply(id: number, r: DecoderResult): void;
    ready(): void;
  };
}

export type DecoderCommand = { id: number; bytes: Uint8Array };
export type DecoderResult = { ok: true; pcm: Int16Array } | { ok: false; code: "decode-failed" | "too-long" | "lost" };

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const path = v.pipe(v.string(), v.minLength(1), v.maxLength(2048));

export const TRANSCRIPTS_ARGS = {
  list: v.tuple([v.optional(v.object({ search: v.optional(v.pipe(v.string(), v.maxLength(200))) }))]),
  get: v.tuple([id]),
  pickFile: v.tuple([]),
  checkFile: v.tuple([path]),
  importFile: v.tuple([v.object({ path, language: v.picklist(TRANSCRIPT_LANGUAGES) })]),
  cancel: v.tuple([id]),
  resume: v.tuple([id]),
  writeNotes: v.tuple([id]),
  rename: v.tuple([id, v.pipe(v.string(), v.maxLength(400))]),
  remove: v.tuple([id]),
  copyText: v.tuple([id, v.object({ from: v.pipe(v.number(), v.minValue(0)), to: v.pipe(v.number(), v.minValue(0)) })]),
  deleteAudio: v.tuple([id]),
  deleteAllAudio: v.tuple([]),
  settings: v.tuple([]),
  patchSettings: v.tuple([TranscriptsPatchSchema]),
  push: v.tuple([]),
} as const satisfies Record<TranscriptsMethod, v.GenericSchema<unknown[]>>;

export const DecoderReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.variant("ok", [v.object({ ok: v.literal(true), pcm: v.instance(Int16Array) }), v.object({ ok: v.literal(false), code: v.picklist(["decode-failed", "too-long"]) })]),
]);
