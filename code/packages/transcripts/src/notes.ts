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

/** The line every export with a summary ends with. */
export const footerOf = (writer: string): string => `Summary written by ${writer}.`;

const stampOf = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The notes as a block of text for a file: summary, then chapters. The footer names the writer. */
export function notesBlock(doc: NoteDoc, md: boolean): string[] {
  const h = (t: string) => (md ? `## ${t}` : t);
  const out = [h("Summary"), doc.summary, ""];
  if (doc.chapters.length) out.push(h("Chapters"), ...doc.chapters.map((c) => `${md ? "- " : ""}[${stampOf(c.start)}] ${c.title}`), "");
  out.push(md ? `_${footerOf(doc.writer)}_` : footerOf(doc.writer), "");
  return out;
}
