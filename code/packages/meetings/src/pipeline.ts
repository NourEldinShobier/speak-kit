import { createGate, decodeWav, runJob, type Segment } from "@speakkit/transcripts";
import { failure, FAILED, NOTHING, type MeetingsDeps, type Outcome } from "./api";
import type { EventLog } from "./events";
import { suppressEcho } from "./echo";
import { vocabularyVersion, writeNotes, type NotesOutcome } from "./notes";
import type { MeetingSearch } from "./search";
import { cleanOutput, energyHasSpeech } from "./silence";
import type { Line, MeetingEntry, MeetingStore } from "./store";
import { TrackWriter, type TrackName } from "./tracks";
import type { Failure } from "./types";

type JobDeps = Parameters<typeof runJob>[0];

export interface PipelineContext {
  d: MeetingsDeps;
  store: MeetingStore;
  search: MeetingSearch;
  events: EventLog;
  writers: Map<string, TrackWriter>;
  patch(id: string, p: Partial<MeetingEntry>): Promise<unknown>;
}

export type TrackResult = { ok: true; lines: Line[] } | { ok: false; failure: Failure; interrupted: boolean };

/** What turns saved audio into a transcript and notes: transcription per track, the merge with echo removal, the notes pass, vocabulary versions and finishing the audio files. */
export function createPipeline(c: PipelineContext) {
  const { d, store, search, patch, writers } = c;
  const clear = createGate({ busy: d.busy, sleep: d.sleep });
  const speech = d.hasSpeech ?? ((p: Int16Array) => energyHasSpeech(p));

  const reindex = async (e: MeetingEntry) => {
    if (e.trashedAt !== undefined || e.status !== "done") return search.remove(e.id);
    const notes = await store.notes(e.id);
    const last = notes.at(-1);
    search.set(e.id, { title: e.title, ...(last && { summary: [last.summary, ...last.chapters.map((x) => x.title)].join(" ") }), text: (await store.transcript(e.id)).map((l) => l.text).join(" ") });
  };

  /** Transcribes one track from its WAV; segments of a silent or invented-text chunk are dropped. */
  const track = async (id: string, name: TrackName, signal: AbortSignal): Promise<TrackResult> => {
    const wav = await d.fs.read(store.files(id).wav(name)).catch(() => undefined);
    if (!wav) return { ok: true, lines: [] };
    let pcm: Int16Array;
    try {
      pcm = decodeWav(wav);
    } catch {
      return { ok: false, failure: { code: "decode-failed", message: "The saved audio could not be read." }, interrupted: false };
    }
    const lang = d.language();
    const r = await runJob(
      {
        transcribe: async (part, language, s) => {
          if (!speech(part)) return { ok: true, text: "", speech: false };
          const out = await d.transcribe(part, language, s);
          if (!out.ok) return out;
          const text = cleanOutput(out.text, { language: lang, hints: d.hints?.() ?? [] });
          return { ok: true, text, speech: out.speech && !!text };
        },
        clear,
        sleep: d.sleep,
      } as JobDeps,
      { pcm, language: lang, signal },
    );
    if (r.status === "done") return { ok: true, lines: r.segments.map((s: Segment) => ({ ...s, who: name === "you" ? ("You" as const) : ("Them" as const) })) };
    return { ok: false, failure: r.failure ?? FAILED, interrupted: r.status === "interrupted" || r.status === "cancelled" };
  };

  const merge = (you: Line[], them: Line[]): Line[] => {
    const kept = suppressEcho(you, them, { headphones: d.headphones() }).map((s) => ({ ...s, who: "You" as const }));
    return [...kept, ...them].sort((a, b) => a.start - b.start || (a.who < b.who ? 1 : -1));
  };

  const notesPass = async (id: string): Promise<void> => {
    const deps = d.notes();
    if (!deps) return;
    await patch(id, { notes: { state: "writing", chapters: store.get(id)?.notes.chapters ?? 0 } });
    const lines = await store.transcript(id);
    const out: NotesOutcome = await writeNotes(deps, lines);
    if (!out.ok) {
      await patch(id, { notes: { state: "failed", failure: out.failure, chapters: store.get(id)?.notes.chapters ?? 0 } });
      return;
    }
    try {
      await store.addNotes(id, { at: d.now(), kind: "summary", title: out.notes.title, summary: out.notes.summary, chapters: out.notes.chapters, writer: out.writer });
    } catch (e) {
      await patch(id, { notes: { state: "failed", failure: failure(e, FAILED), chapters: 0 } });
      return;
    }
    const keep = store.get(id);
    await patch(id, { notes: { state: "done", chapters: out.notes.chapters.length }, ...(keep?.titleTemporary && { title: out.notes.title, titleTemporary: false }) });
    // The person's vocabulary is applied as a later version, never into the writer's own output.
    const done = store.get(id);
    if (done) await reindex(done);
    await vocabulary(id).catch(() => {});
  };

  const vocabulary = async (id: string): Promise<number> => {
    const last = (await store.notes(id)).at(-1);
    if (!last) return 0;
    const v = vocabularyVersion(last, d.vocabulary(), d.now());
    if (!v) return 0;
    await store.addNotes(id, v.version);
    const e = store.get(id);
    if (e) await patch(id, { notes: { ...e.notes, chapters: v.version.chapters.length }, ...(e.titleTemporary ? {} : { title: v.version.title }) });
    return v.changed;
  };

  /** Turns the spools of a recording into WAV files; the first failure is returned and the audio stays as spools. */
  const finalise = async (id: string): Promise<Outcome<{ youBytes: number; themBytes: number }>> => {
    const w = writers.get(id) ?? new TrackWriter({ fs: d.fs, files: store.files(id), sleep: d.sleep });
    const you = await w.finish("you");
    if (!you.ok) return you;
    const them = await w.finish("them");
    if (!them.ok) return them;
    if (!you.bytes && !them.bytes) return { ok: false, failure: NOTHING };
    return { ok: true, youBytes: you.bytes, themBytes: them.bytes };
  };

  /** The whole job of one meeting whose audio is saved: both tracks, the merge, the transcript file, the finished event, then the notes. */
  const transcribe = async (id: string, signal: AbortSignal): Promise<void> => {
    await patch(id, { status: "transcribing", failure: undefined as never });
    try {
      const you = await track(id, "you", signal);
      const them = you.ok ? await track(id, "them", signal) : you;
      if (!you.ok || !them.ok) {
        const bad = !you.ok ? you : (them as { failure: Failure; interrupted: boolean });
        await patch(id, { status: bad.interrupted ? "interrupted" : "failed", failure: bad.failure });
        return;
      }
      await store.putTranscript(id, merge(you.lines, them.lines));
      await patch(id, { status: "done", failure: undefined as never });
      const done = store.get(id)!;
      await reindex(done);
      await c.events.emit({ meetingId: id, title: done.title, durationSec: done.durationSec });
    } catch (err) {
      await patch(id, { status: "failed", failure: failure(err, FAILED) });
      return;
    }
    await notesPass(id);
  };

  return { reindex, vocabulary, notesPass, finalise, transcribe };
}
