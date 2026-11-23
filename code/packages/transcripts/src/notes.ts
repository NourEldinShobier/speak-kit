import type { Failure, Segment } from "./types";

/** What a writer says when it fails: its own code and a message that says what to do. */
export interface WriterFailure {
  code: string;
  message: string;
}

/** The title, the two-sentence summary and the chapters a writer made from the finished transcript, with who wrote them. */
export interface NoteDoc {
  title: string;
  summary: string;
  chapters: { start: number; title: string; text: string }[];
  writer: string;
  at: number;
}

/** What a window shows of the notes: being written, written, or failed (the last good notes, if any, stay). */
export type NotesView = { state: "writing"; doc?: NoteDoc } | { state: "ready"; doc: NoteDoc } | { state: "failed"; failure: Failure; doc?: NoteDoc };

export type NotesState = NotesView["state"];

export type SummariseResult = { ok: true; notes: Omit<NoteDoc, "writer" | "at">; writer: string } | { ok: false; failure: WriterFailure };

/** The writer. It owns the key, the network and the model; every failure comes back as a result with a message. */
export type Summarise = (segments: readonly Segment[], signal?: AbortSignal) => Promise<SummariseResult>;

/** What is saved next to the words: the last good notes and the last failure, so a failed pass never removes notes already written. */
export interface NotesRecord {
  doc?: NoteDoc;
  failure?: Failure;
}

export const viewOf = (r: NotesRecord | undefined, writing: boolean): NotesView | undefined => {
  if (writing) return { state: "writing", ...(r?.doc && { doc: r.doc }) };
  if (!r) return undefined;
  if (r.failure) return { state: "failed", failure: r.failure, ...(r.doc && { doc: r.doc }) };
  return r.doc ? { state: "ready", doc: r.doc } : undefined;
};
