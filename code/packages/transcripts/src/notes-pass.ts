import type { Outcome, TranscriptsDeps } from "./api";
import { failures } from "./formats";
import type { NoteDoc, SummariseResult } from "./notes";
import type { Store } from "./store";
import type { Entry, Failure } from "./types";

const OFF: Failure = { code: "notes", message: "Notes are off. Turn on writing notes in the Meetings settings, then write them again. The transcript is unchanged." };
const NOTHING: Failure = { code: "notes", message: "There is nothing to write notes from: no words were heard." };
const THREW: Failure = { code: "notes", message: "The notes could not be written. The transcript is unchanged." };

const failureOf = (r: SummariseResult | undefined): Failure | undefined => {
  if (!r) return THREW;
  return r.ok ? undefined : { code: "notes", message: r.failure.message };
};

interface Ctx {
  d: Pick<TranscriptsDeps, "notes" | "now" | "changed">;
  store: Store;
  settle(id: string, patch: { notes?: Entry["notes"] }): Promise<unknown>;
  writing: Set<string>;
  failure(e: unknown): Failure;
}

/**
 * One notes pass for a transcript. The words and the audio are never an output: a failure is saved next to the last good notes and the transcript stays
 * as it was. Every failure is a result with a message, never a throw.
 */
export function notesRunner({ d, store, settle, writing, failure }: Ctx): (id: string) => Promise<Outcome> {
  return async (id) => {
    const summarise = d.notes?.();
    const e = store.get(id);
    if (!summarise) return { ok: false, failure: OFF };
    if (e?.status !== "done" || writing.has(id)) return { ok: false, failure: failures.failed() };
    const segments = await store.segments(id);
    if (!segments.some((s) => s.text.trim())) return { ok: false, failure: NOTHING };
    writing.add(id);
    d.changed();
    try {
      const r = await summarise(segments).catch(() => undefined);
      const bad = failureOf(r);
      const prev = await store.notes(id);
      const doc: NoteDoc | undefined = r?.ok ? { ...r.notes, writer: r.writer, at: d.now() } : prev?.doc;
      await store.saveNotes(id, { ...(doc && { doc }), ...(bad && { failure: bad }) });
      await settle(id, { notes: bad ? "failed" : "ready" });
      return bad ? { ok: false, failure: bad } : { ok: true };
    } catch (err) {
      return { ok: false, failure: failure(err) };
    } finally {
      writing.delete(id);
      d.changed();
    }
  };
}
