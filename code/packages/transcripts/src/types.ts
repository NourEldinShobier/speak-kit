/** Seconds from the start of the audio. */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

export type Status = "queued" | "transcribing" | "done" | "failed" | "interrupted" | "cancelled";
export type FailureCode = "unsupported" | "too-large" | "too-long" | "decode-failed" | "engine-missing" | "engine-loading" | "disk-full" | "notes" | "failed";

export interface Failure {
  code: FailureCode;
  message: string;
}

/** One row of the manifest: everything but the words. */
export interface Entry {
  id: string;
  title: string;
  createdAt: number;
  /** The audio file's name. */
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
  /** The 16 kHz audio kept next to the words, until its retention ends. */
  audioBytes: number;
  audioRemovedAt?: number;
  /** Set by a version that had a Trash: such a transcript is deleted for good at the next start. */
  trashedAt?: number;
  /** The last notes pass: written, or failed. */
  notes?: "ready" | "failed";
}

export interface Transcript extends Entry {
  segments: Segment[];
}
