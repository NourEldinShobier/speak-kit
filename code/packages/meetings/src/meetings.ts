import { saveExport } from "@speakkit/transcripts";
import { failure, FAILED, temporaryTitle, type Meetings, type MeetingsDeps, type Row } from "./api";
import { CopyCursor, linesText } from "./cursor";
import { EventLog } from "./events";
import { createPipeline } from "./pipeline";
import { audioLabel, sweep as plan, textDeadline } from "./retention";
import { MeetingSearch, highlightRanges } from "./search";
import { MeetingStore, type MeetingEntry } from "./store";
import { TrackWriter } from "./tracks";

export { temporaryTitle, type Detail, type Meetings, type MeetingsDeps, type Outcome, type Row } from "./api";

const rowOf = (d: MeetingsDeps, e: MeetingEntry, snippet?: string): Row => {
  const r = d.retention();
  const text = textDeadline(e, r);
  const label = audioLabel(e, d.now(), r);
  return {
    id: e.id,
    title: e.title,
    titleTemporary: e.titleTemporary,
    providerId: e.providerId,
    providerName: e.providerName,
    startedAt: e.startedAt,
    durationSec: e.durationSec,
    status: e.status,
    ...(e.failure && { failure: e.failure }),
    notes: e.notes,
    ...(label && { audio: label }),
    audioBytes: e.audio.you + e.audio.them,
    daysLeft: text === undefined ? null : Math.max(0, Math.ceil((text - d.now()) / 86_400_000)),
    trashed: e.trashedAt !== undefined,
    ...(snippet && { snippet }),
  };
};

const INTERRUPTED = { code: "interrupted", message: "Speak Kit closed while this meeting was recording. The audio that was saved is kept." };
const NO_NOTES = { code: "notes-off", message: "Notes are off. Turn on the summary in Meetings settings first." };

/** The meetings store, the recorder's audio, the pipeline and the finished events, behind one small interface. */
export async function createMeetings(d: MeetingsDeps): Promise<Meetings> {
  const store = await MeetingStore.open({ dir: d.dir, fs: d.fs, now: d.now });
  const events = await EventLog.open({ fs: d.fs, file: `${d.dir}/events.json`, now: d.now });
  const search = new MeetingSearch();
  const writers = new Map<string, TrackWriter>();
  const cursors = new Map<string, CopyCursor>();
  const aborts = new Map<string, AbortController>();
  let work: Promise<unknown> = Promise.resolve();
  let disposed = false;

  const tick = () => d.changed();
  const patch = (id: string, p: Partial<MeetingEntry>) =>
    store
      .mutate((m) => {
        const e = m.get(id);
        if (e) m.set(id, { ...e, ...p });
      })
      .catch(() => store.patchMemory(id, p))
      .finally(tick);
  const pipe = createPipeline({ d, store, search, events, writers, patch });
  search.setVocabulary(d.vocabulary());
  for (const e of store.list()) void pipe.reindex(e);

  /** Transcription and notes of one meeting at a time, in the order they were asked for. */
  const process = (id: string): Promise<void> => {
    const run = work.then(async () => {
      if (!store.get(id) || disposed) return;
      const ac = new AbortController();
      aborts.set(id, ac);
      try {
        await pipe.transcribe(id, ac.signal);
      } finally {
        aborts.delete(id);
      }
    });
    work = run.catch(() => {});
    return run;
  };

  // A meeting that was running when the app stopped: its spools become audio and it waits as "interrupted" for Try again or Delete.
  for (const e of store.list()) {
    if (e.status === "recording" || e.status === "saving") {
      const f = await pipe.finalise(e.id);
      await patch(
        e.id,
        f.ok ? { status: "interrupted", endedAt: e.endedAt ?? d.now(), audio: { you: f.youBytes, them: f.themBytes }, failure: INTERRUPTED } : { status: "failed", failure: f.failure },
      );
    } else if (e.status === "transcribing") {
      await patch(e.id, { status: "interrupted", failure: { code: "interrupted", message: "Speak Kit closed before the transcript was finished." } });
    }
  }

  const fresh = (id: string, a: { providerId: string; providerName: string; title?: string }, at: number): MeetingEntry => ({
    id,
    title: a.title?.trim() || temporaryTitle(a.providerName, at),
    titleTemporary: true,
    providerId: a.providerId,
    providerName: a.providerName,
    startedAt: at,
    durationSec: 0,
    status: "recording",
    audio: { you: 0, them: 0 },
    notes: { state: "off", chapters: 0 },
    exports: [],
  });

  return {
    notice: () => store.notice,
    list(o = {}) {
      const q = o.search?.trim();
      const all = store.list().filter((e) => (o.trashed ? e.trashedAt !== undefined : e.trashedAt === undefined));
      if (!q) return all.map((e) => rowOf(d, e));
      const hits = new Map(search.search(q).map((h, i) => [h.id, { h, i }]));
      return all
        .filter((e) => hits.has(e.id))
        .sort((a, b) => hits.get(a.id)!.i - hits.get(b.id)!.i)
        .map((e) => rowOf(d, e, hits.get(e.id)!.h.snippet));
    },
    async get(id) {
      const e = store.get(id);
      if (!e) return undefined;
      return { ...rowOf(d, e), lines: await store.transcript(id), versions: await store.notes(id), files: e.exports };
    },
    async begin(a) {
      const id = d.newId();
      try {
        await store.mutate((m) => void m.set(id, fresh(id, a, d.now())));
      } catch (e) {
        return { ok: false, failure: failure(e, FAILED) };
      } finally {
        tick();
      }
      writers.set(id, new TrackWriter({ fs: d.fs, files: store.files(id), sleep: d.sleep }));
      return { ok: true, id };
    },
    async append(id, name, pcm, atSec) {
      const w = writers.get(id);
      if (!w) return { ok: false, failure: FAILED };
      try {
        await w.append(name, pcm, atSec);
        return { ok: true };
      } catch (e) {
        return { ok: false, failure: failure(e, FAILED) };
      }
    },
    async end(id) {
      const e = store.get(id);
      if (!e || e.status !== "recording") return { ok: false, failure: FAILED };
      await patch(id, { status: "saving", endedAt: d.now() });
      const f = await pipe.finalise(id);
      writers.delete(id);
      const durationSec = Math.max(0, ((store.get(id)?.endedAt ?? d.now()) - e.startedAt) / 1000);
      if (!f.ok) {
        await patch(id, { status: "failed", failure: f.failure, durationSec });
        return f;
      }
      await patch(id, { status: "transcribing", audio: { you: f.youBytes, them: f.themBytes }, durationSec });
      void process(id);
      return { ok: true, id };
    },
    async retry(id) {
      const e = store.get(id);
      if (!e || (e.status !== "failed" && e.status !== "interrupted")) return { ok: false, failure: FAILED };
      // A recording that failed while finishing still has its spools: finish them first.
      if (e.audio.you + e.audio.them === 0) {
        const f = await pipe.finalise(id);
        if (!f.ok) {
          await patch(id, { status: "failed", failure: f.failure });
          return f;
        }
        await patch(id, { audio: { you: f.youBytes, them: f.themBytes } });
      }
      await patch(id, { status: "transcribing" });
      void process(id);
      return { ok: true };
    },
    async regenerateNotes(id) {
      if (store.get(id)?.status !== "done" || !d.notes()) return { ok: false, failure: NO_NOTES };
      await pipe.notesPass(id);
      return { ok: true };
    },
    async applyVocabulary(id) {
      if (!store.get(id)) return { ok: false, failure: FAILED };
      try {
        const changed = await pipe.vocabulary(id);
        await pipe.reindex(store.get(id)!);
        return { ok: true, changed };
      } catch (err) {
        return { ok: false, failure: failure(err, FAILED) };
      } finally {
        tick();
      }
    },
    async copyNew(id) {
      const cur = cursors.get(id) ?? cursors.set(id, new CopyCursor()).get(id)!;
      return linesText(cur.take(await store.transcript(id)));
    },
    async text(id, labels = true) {
      return store.get(id) ? linesText(await store.transcript(id), labels) : undefined;
    },
    async writeFiles(id) {
      const e = store.get(id);
      if (!e) return { ok: false, failure: FAILED };
      const last = (await store.notes(id)).at(-1);
      const paths: string[] = [];
      try {
        paths.push((await saveExport(d.fs, d.exportDir(), e.title, "txt", linesText(await store.transcript(id)))).path);
        if (last) {
          const body = [last.title, "", last.summary, "", ...last.chapters.flatMap((c) => [c.title, c.text, ""])].join("\n");
          paths.push((await saveExport(d.fs, d.exportDir(), `${e.title} notes`, "txt", body)).path);
        }
      } catch (err) {
        return { ok: false, failure: failure(err, { code: "export-failed", message: "The files could not be written." }) };
      }
      await patch(id, { exports: paths });
      return { ok: true, paths };
    },
    async rename(id, title) {
      const t = title.trim();
      if (!t) return;
      await patch(id, { title: t.slice(0, 200), titleTemporary: false });
      const e = store.get(id);
      if (e) await pipe.reindex(e);
    },
    async trash(id) {
      await patch(id, { trashedAt: d.now() });
      search.remove(id);
    },
    async restore(id) {
      await patch(id, { trashedAt: undefined as never });
      const e = store.get(id);
      if (e) await pipe.reindex(e);
    },
    async remove(id) {
      aborts.get(id)?.abort();
      writers.delete(id);
      cursors.delete(id);
      search.remove(id);
      await store.removeFiles(id).catch(() => {});
      await store.mutate((m) => void m.delete(id)).catch(() => {});
      tick();
    },
    async sweep() {
      const out = { trashed: 0, removed: 0, audioDropped: 0 };
      // Read and write under one lock: a change made while the sweep decided is never overwritten by what it read before.
      await store
        .mutate(async (m) => {
          const s = plan([...m.values()], d.now(), d.retention());
          for (const id of s.dropAudio) {
            await store.removeFiles(id, ["you.wav", "them.wav"]);
            m.set(id, { ...m.get(id)!, audio: { you: 0, them: 0 }, audioRemovedAt: d.now() });
            out.audioDropped++;
          }
          for (const id of s.trash) {
            m.set(id, { ...m.get(id)!, trashedAt: d.now() });
            out.trashed++;
          }
          for (const id of s.remove) {
            await store.removeFiles(id);
            m.delete(id);
            search.remove(id);
            out.removed++;
          }
        })
        .catch(() => {});
      if (out.trashed || out.removed || out.audioDropped) tick();
      return out;
    },
    since: (seq, limit) => events.since(seq, limit),
    ack: (c, seq) => events.ack(c, seq),
    vocabularyChanged() {
      search.setVocabulary(d.vocabulary());
      for (const e of store.list()) void pipe.reindex(e);
    },
    highlights: highlightRanges,
    async dispose() {
      disposed = true;
      for (const ac of aborts.values()) ac.abort("quit");
      await work;
    },
  };
}
