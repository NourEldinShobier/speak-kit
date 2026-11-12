import { RATE } from "./chunker";
import type { Outcome, Row, Transcripts, TranscriptsDeps } from "./api";
import { toRow } from "./row";
import { render } from "./export";
import { saveExport, sha256 } from "./files";
import { DiskFullError } from "./fs";
import { failures, MAX_HOURS } from "./formats";
import { runJob } from "./job";
import { createGate, JobQueue, QueueFullError } from "./queue";
import { sweep, audioTotal } from "./retention";
import { SearchIndex } from "./search";
import { recordingApi } from "./recording";
import { viewOf } from "./notes";
import { notesRunner } from "./notes-pass";
import { openStore, type Store } from "./store";
import { provisionalTitle } from "./title";
import type { Entry, Failure } from "./types";
import { decodeWav, encodeWav16k } from "./wav";

export type { Detail, Outcome, Row, Transcripts, TranscriptsDeps } from "./api";

export async function createTranscripts(d: TranscriptsDeps): Promise<Transcripts> {
  const store: Store = await openStore({ dir: d.dir, fs: d.fs, now: d.now, newId: d.newId });
  const index = new SearchIndex();
  const queue = new JobQueue();
  const clear = createGate({ busy: d.busy, sleep: d.sleep });
  const spooled = new Map<string, number>();
  const writing = new Set<string>();
  let notesIdle: Promise<unknown> = Promise.resolve();
  let idle: Promise<unknown> = Promise.resolve();

  const indexOne = async (e: Entry) => {
    if (e.trashedAt || (e.status !== "done" && e.status !== "interrupted" && e.status !== "cancelled")) return index.remove(e.id);
    index.set(e.id, `${e.title}\n${(await store.segments(e.id)).map((s) => s.text).join(" ")}`);
  };
  /** Saves a change; when the disk refuses it the change still shows in the window (and the last saved state is what the next start finds). */
  const settle = async (id: string, patch: Parameters<Store["update"]>[1]): Promise<Entry | undefined> => {
    try {
      return await store.update(id, patch);
    } catch {
      store.patchMemory(id, patch);
      return store.get(id);
    }
  };
  const failure = (e: unknown): Failure => (e instanceof DiskFullError ? failures.diskFull() : failures.failed());
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } finally {
      d.changed();
    }
  };

  const row = (e: Entry, snippet?: string): Row => toRow(e, { queue, spooled, writing, now: d.now(), policy: d.policy(), snippet });

  const quit = new AbortController();
  const notesPass = notesRunner({ d, quit: quit.signal, reindex: indexOne, store, settle, writing, failure });

  async function job(id: string, signal: AbortSignal): Promise<void> {
    const e = store.get(id);
    if (!e) return;
    try {
      const wav = await store.readAudio(id);
      if (!wav) {
        await settle(id, { status: "failed", failure: e.source === "microphone" ? failures.nothingRecorded() : failures.decode(e.sourceName ?? e.title) });
        return;
      }
      const pcm = decodeWav(wav);
      const resume = { chunksDone: e.chunksDone, segments: await store.segments(id) };
      await store.update(id, { status: "transcribing", model: d.model(), durationSec: pcm.length / RATE, failure: undefined });
      d.changed();
      const r = await runJob(
        {
          transcribe: d.transcribe,
          clear,
          ...(d.deadlineMs && { deadlineMs: d.deadlineMs }),
          ...(d.chunks && { chunks: d.chunks }),
          checkpoint: async (done, total, segments) => {
            await store.saveSegments(id, segments);
            await store.update(id, { chunksDone: done, chunksTotal: total });
            d.changed();
          },
        },
        { pcm, language: e.language, ...(resume.chunksDone > 0 && { resume }), signal },
      );
      const patch: Partial<Entry> = { status: r.status, chunksDone: r.chunksDone, chunksTotal: r.chunksTotal };
      if (r.failure) patch.failure = r.failure;
      let saved = true;
      try {
        await store.saveSegments(id, r.segments);
      } catch (err) {
        saved = false;
        patch.status = "failed";
        patch.failure = failure(err);
      }
      let next = await settle(id, patch);
      if (next && saved) await indexOne(next);
      // Imported audio only waited for the job; a recording's audio goes now if the person keeps none.
      if (r.status === "done" && saved && (e.source === "file" || !d.policy().keepAudio)) {
        await store.dropAudio(id).catch(() => {});
        next = store.get(id);
      }
      if (r.status === "done" && saved && d.notes?.()) notesIdle = Promise.all([notesIdle, notesPass(id)]);
    } catch (err) {
      await settle(id, { status: "failed", failure: failure(err) });
    } finally {
      d.changed();
    }
  }

  const enqueue = (id: string): Outcome<{ position: number }> => {
    try {
      const position = queue.add(id, (signal) => {
        const p = job(id, signal);
        idle = p;
        return p;
      });
      return { ok: true, position };
    } catch (err) {
      return { ok: false, failure: err instanceof QueueFullError ? { code: "failed", message: "Too many transcripts are waiting. Try again when some are done." } : failure(err) };
    }
  };

  /**
   * Deletes a transcript for good. Files the app exported (when the person has not changed them) and its audio go to the recycle bin first; an export that
   * cannot be recycled stays where it is and the person is told. Audio that cannot be recycled is deleted with the transcript.
   */
  async function purge(id: string) {
    const e = store.get(id);
    if (e && d.recycle) {
      const kept: string[] = [];
      for (const f of e.exports) {
        const now = await d.fs.read(f.path).catch(() => undefined);
        if (!now || sha256(now) !== f.sha256) continue;
        await d.recycle(f.path).catch(() => void kept.push(f.path));
      }
      const audio = store.audioPath(id);
      if (await d.fs.exists(audio).catch(() => false)) await d.recycle(audio).catch(() => {});
      if (kept.length)
        d.warn?.(
          `${kept.length === 1 ? "An exported file" : `${kept.length} exported files`} could not be moved to the Recycle Bin and ${kept.length === 1 ? "was" : "were"} left where ${kept.length === 1 ? "it is" : "they are"}.`,
        );
    }
    await store.remove(id);
  }

  async function sweepNow() {
    const s = sweep([...store.list(), ...store.list(true)], d.now(), d.policy());
    for (const id of s.trash) {
      await store.trash(id);
      index.remove(id);
    }
    for (const id of s.remove) await purge(id);
    for (const id of s.dropAudio) await store.dropAudio(id);
    return { trashed: s.trash.length, removed: s.remove.length, audioDropped: s.dropAudio.length };
  }

  const recording = recordingApi({ d, store, spooled, settle, failure, enqueue, run });
  const finalizeSpool = recording.finalizeSpool;
  const ready = (async () => {
    for (const e of [...store.list(), ...store.list(true)]) await indexOne(e);
    await run(() => sweepNow());
  })();

  return {
    ready,
    notice: () => ({ newer: store.newer, ...(store.unreadable && { unreadable: true }), ...(store.recoveredFrom && { recoveredFrom: store.recoveredFrom }) }),
    list({ search, trashed = false }: { search?: string; trashed?: boolean } = {}) {
      const q = search?.trim();
      if (q && !trashed) {
        const out: Row[] = [];
        for (const h of index.search(q)) {
          const e = store.get(h.id);
          if (e) out.push(row(e, h.snippet));
        }
        return out;
      }
      return store.list(trashed).map((e) => row(e));
    },
    async get(id) {
      const e = store.get(id);
      if (!e) return undefined;
      const notes = viewOf(await store.notes(id), writing.has(id));
      return { ...row(e), segments: await store.segments(id), exports: e.exports, ...(notes && { notes }) };
    },
    importAudio: ({ name, pcm, language }) =>
      run(async () => {
        if (pcm.length / RATE > MAX_HOURS * 3600) return { ok: false, failure: failures.tooLong() };
        if (!pcm.length) return { ok: false, failure: failures.decode(name) };
        const id = store.newId();
        const wav = encodeWav16k(pcm);
        try {
          await store.writeAudio(id, wav);
          await store.add({
            id,
            title: provisionalTitle({ source: "file", name, at: d.now() }),
            source: "file",
            sourceName: name,
            language,
            model: d.model(),
            durationSec: pcm.length / RATE,
            audioBytes: wav.byteLength,
          });
        } catch (err) {
          await d.fs.remove(store.audioPath(id)).catch(() => {});
          return { ok: false, failure: failure(err) };
        }
        const q = enqueue(id);
        if (!q.ok) {
          await store.remove(id).catch(() => {});
          return q;
        }
        return { ok: true, id };
      }),
    beginRecording: recording.beginRecording,
    appendRecording: recording.appendRecording,
    finishRecording: recording.finishRecording,
    discardRecording: recording.discardRecording,
    resume: (id) =>
      run(async () => {
        const e = store.get(id);
        if (!e || queue.has(id) || !(e.status === "interrupted" || e.status === "failed" || e.status === "cancelled")) return { ok: false, failure: failures.failed() };
        if (!(await store.readAudio(id)) && (await d.fs.exists(store.spoolPath(id)))) {
          const bad = await finalizeSpool(id);
          if (bad) return { ok: false, failure: bad };
        }
        await settle(id, { status: "queued", failure: undefined });
        const q = enqueue(id);
        if (!q.ok) {
          await settle(id, { status: "failed", failure: q.failure });
          return q;
        }
        return { ok: true };
      }),
    cancel: (id) =>
      run(async () => {
        const wasWaiting = queue.waiting.includes(id);
        if (queue.cancel(id, "cancel") && wasWaiting) await settle(id, { status: "cancelled" });
      }),
    writeNotes: (id) => run(() => notesPass(id)),
    rename: (id, title) =>
      run(async () => {
        const t = title.trim();
        if (!t) return;
        const e = await store.update(id, { title: t.slice(0, 200) });
        await indexOne(e);
      }),
    trash: (id) =>
      run(async () => {
        if (queue.cancel(id, "cancel")) await idle;
        await store.trash(id);
        index.remove(id);
      }),
    restore: (id) =>
      run(async () => {
        await store.restore(id);
        await indexOne(store.get(id)!);
      }),
    remove: (id) =>
      run(async () => {
        if (queue.cancel(id, "cancel")) await idle;
        index.remove(id);
        await purge(id);
      }),
    emptyTrash: () =>
      run(async () => {
        const ids = store.list(true).map((e) => e.id);
        for (const id of ids) index.remove(id);
        for (const id of ids) await purge(id);
        return ids.length;
      }),
    async text(id, format) {
      const e = store.get(id);
      if (!e) return undefined;
      return { name: e.title, text: render(format, { ...e, segments: await store.segments(id), notes: (await store.notes(id))?.doc }) };
    },
    save: (id, format) =>
      run(async () => {
        const e = store.get(id);
        if (!e) return { ok: false, failure: failures.failed() };
        const ext: string = format;
        const previous = e.exports.find((f) => f.path.toLowerCase().endsWith(`.${ext}`));
        try {
          const saved = await saveExport(d.fs, d.exportDir(), e.title, ext, render(format, { ...e, segments: await store.segments(id), notes: (await store.notes(id))?.doc }), previous);
          const exports = [...e.exports.filter((f) => f !== previous), { path: saved.path, sha256: saved.sha256 }];
          await store.update(id, { exports });
          return { ok: true, ...saved };
        } catch (err) {
          return { ok: false, failure: failure(err) };
        }
      }),
    dropAudio: (id) =>
      run(async () => {
        const e = store.get(id);
        if (e && e.status !== "transcribing" && e.status !== "queued" && e.status !== "recording") await store.dropAudio(id);
      }),
    dropAllAudio: () =>
      run(async () => {
        let n = 0;
        for (const e of [...store.list(), ...store.list(true)]) {
          if (e.audioBytes === 0 || e.status === "transcribing" || e.status === "queued" || e.status === "recording") continue;
          await store.dropAudio(e.id);
          n++;
        }
        return n;
      }),
    sweep: () => run(sweepNow),
    storage: () => ({ audioBytes: audioTotal(store.list().concat(store.list(true))), count: store.list().length, trashed: store.list(true).length }),
    async dispose() {
      queue.stopAll("quit");
      quit.abort();
      await idle;
      await notesIdle;
    },
  };
}
