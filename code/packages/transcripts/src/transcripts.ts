import { RATE } from "./chunker";
import type { Outcome, Row, Transcripts, TranscriptsDeps } from "./api";
import { toRow } from "./row";
import { render } from "./export";
import { saveExport } from "./files";
import { DiskFullError } from "./fs";
import { failures, MAX_HOURS } from "./formats";
import { runJob } from "./job";
import { createGate, JobQueue, QueueFullError } from "./queue";
import { sweep, audioTotal } from "./retention";
import { SearchIndex } from "./search";
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

  const row = (e: Entry, snippet?: string): Row => toRow(e, { queue, spooled, now: d.now(), policy: d.policy(), snippet });

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
      const next = await settle(id, patch);
      if (next && saved) await indexOne(next);
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

  async function sweepNow() {
    const s = sweep([...store.list(), ...store.list(true)], d.now(), d.policy());
    for (const id of s.trash) {
      await store.trash(id);
      index.remove(id);
    }
    for (const id of s.remove) await store.remove(id);
    for (const id of s.dropAudio) await store.dropAudio(id);
    return { trashed: s.trash.length, removed: s.remove.length, audioDropped: s.dropAudio.length };
  }

  /** The audio of a recording that never finished: what was spooled becomes the audio file. */
  async function finalizeSpool(id: string): Promise<Failure | undefined> {
    const raw = await d.fs.read(store.spoolPath(id));
    const even = raw ? raw.subarray(0, raw.length - (raw.length % 2)) : undefined;
    if (!even?.length) return failures.nothingRecorded();
    const pcm = new Int16Array(even.buffer.slice(even.byteOffset, even.byteOffset + even.length));
    try {
      await store.putAudio(id, encodeWav16k(pcm));
      await store.update(id, { durationSec: pcm.length / RATE });
      await d.fs.remove(store.spoolPath(id));
    } catch (err) {
      return failure(err);
    }
    return undefined;
  }

  const ready = (async () => {
    for (const e of [...store.list(), ...store.list(true)]) await indexOne(e);
    await run(() => sweepNow());
  })();

  return {
    ready,
    notice: () => ({ newer: store.newer, ...(store.recoveredFrom && { recoveredFrom: store.recoveredFrom }) }),
    list({ search, trashed = false }: { search?: string; trashed?: boolean } = {}) {
      const q = search?.trim();
      if (q && !trashed) {
        const out: Row[] = [];
        for (const h of index.search(q)) {
          const e = store.get(h.id);
          if (e && !e.trashedAt) out.push(row(e, h.snippet));
        }
        return out;
      }
      return store.list(trashed).map((e) => row(e));
    },
    async get(id) {
      const e = store.get(id);
      return e ? { ...row(e), segments: await store.segments(id) } : undefined;
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
    beginRecording: (language) =>
      run(async () => {
        try {
          const e = await store.add({ title: provisionalTitle({ source: "microphone", at: d.now() }), source: "microphone", language, model: d.model(), status: "recording" });
          spooled.set(e.id, 0);
          return { ok: true, id: e.id };
        } catch (err) {
          return { ok: false, failure: failure(err) };
        }
      }),
    async appendRecording(id, pcm) {
      if (!spooled.has(id)) return { ok: false, failure: failures.failed() };
      try {
        await d.fs.append(store.spoolPath(id), new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
      } catch (err) {
        return { ok: false, failure: failure(err) };
      }
      const n = spooled.get(id)! + pcm.length;
      spooled.set(id, n);
      return { ok: true, seconds: n / RATE };
    },
    finishRecording: (id) =>
      run(async () => {
        const e = store.get(id);
        if (!e || e.status !== "recording") return { ok: false, failure: failures.failed() };
        spooled.delete(id);
        const bad = await finalizeSpool(id);
        if (bad) {
          await settle(id, { status: "failed", failure: bad });
          return { ok: false, failure: bad };
        }
        await settle(id, { status: "queued" });
        const q = enqueue(id);
        if (!q.ok) {
          await settle(id, { status: "failed", failure: q.failure });
          return q;
        }
        return { ok: true, id };
      }),
    discardRecording: (id) =>
      run(async () => {
        spooled.delete(id);
        await store.remove(id);
      }),
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
        await store.remove(id);
      }),
    emptyTrash: () =>
      run(async () => {
        const ids = store.list(true).map((e) => e.id);
        for (const id of ids) index.remove(id);
        return store.emptyTrash();
      }),
    async text(id, format) {
      const e = store.get(id);
      if (!e) return undefined;
      return { name: e.title, text: render(format, { ...e, segments: await store.segments(id) }) };
    },
    save: (id, format) =>
      run(async () => {
        const e = store.get(id);
        if (!e) return { ok: false, failure: failures.failed() };
        const ext: string = format;
        const previous = e.exports.find((f) => f.path.toLowerCase().endsWith(`.${ext}`));
        try {
          const saved = await saveExport(d.fs, d.exportDir(), e.title, ext, render(format, { ...e, segments: await store.segments(id) }), previous);
          const exports = [...e.exports.filter((f) => f !== previous), { path: saved.path, sha256: saved.sha256 }];
          await store.update(id, { exports });
          return { ok: true, ...saved };
        } catch (err) {
          return { ok: false, failure: failure(err) };
        }
      }),
    sweep: () => run(sweepNow),
    storage: () => ({ audioBytes: audioTotal(store.list().concat(store.list(true))), count: store.list().length, trashed: store.list(true).length }),
    async dispose() {
      queue.stopAll("quit");
      await idle;
    },
  };
}
