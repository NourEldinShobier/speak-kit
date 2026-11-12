/** Seconds from the start of the audio. */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

export type Source = "file" | "microphone";
export type Status = "recording" | "queued" | "transcribing" | "done" | "failed" | "interrupted" | "cancelled";
export type FailureCode = "unsupported" | "too-large" | "too-long" | "decode-failed" | "engine-missing" | "engine-loading" | "disk-full" | "failed";

export interface Failure {
  code: FailureCode;
  message: string;
}

/** A file written by an export, with the hash of what was written: a later rewrite or delete leaves a file the person changed alone. */
export interface ExportedFile {
  path: string;
  sha256: string;
}

/** One row of the manifest: everything but the words. */
export interface Entry {
  id: string;
  title: string;
  createdAt: number;
  source: Source;
  /** The audio file's name for an import. */
  sourceName?: string;
  durationSec: number;
  /** "auto" or a language code. */
  language: string;
  model: string;
  status: Status;
  /** Chunks transcribed so far and in all; the work resumes after the last done chunk. */
  chunksDone: number;
  chunksTotal: number;
  failure?: Failure;
  /** True for a microphone recording found unfinished at start-up. */
  recovered?: boolean;
  /** The 16 kHz audio kept next to the words, until its retention ends. */
  audioBytes: number;
  audioRemovedAt?: number;
  trashedAt?: number;
  exports: ExportedFile[];
}

export interface Transcript extends Entry {
  segments: Segment[];
}
