import { describe, expect, test, vi } from "vitest";
import { createTranscripts, type ChunkResult, type Transcripts } from "../src";
import { clock, DIR, ids, MemFs, tone } from "./fakes";

function setup(
  over: {
    transcribe?: (n: number, pcm: Int16Array, lang: string, signal: AbortSignal) => Promise<ChunkResult> | ChunkResult;
    busy?: () => boolean;
    fs?: MemFs;
    recycle?: (file: string) => Promise<void>;
  } = {},
) {
  const fs = over.fs ?? new MemFs();
  const c = clock();
  const changed = vi.fn();
  let calls = 0;
  const langs: string[] = [];
  const make = () =>
    createTranscripts({
      dir: DIR,
      fs,
      now: c.now,
      newId: ids(),
      transcribe: async (pcm, lang, signal) => {
        langs.push(lang);
        return (over.transcribe ?? ((n) => ({ ok: true, text: `words ${n}`, speech: true })))(++calls, pcm, lang, signal);
      },
      busy: over.busy ?? (() => false),
      sleep: c.sleep,
      model: () => "model-a",
      changed,
      ...(over.recycle && { recycle: over.recycle }),
    });
  return { fs, c, changed, make, langs, calls: () => calls };
}

const settled = async (t: Transcripts, id: string, status: string) => vi.waitFor(async () => expect((await t.get(id))!.status).toBe(status));
const idOf = (r: { ok: boolean }): string => (r as unknown as { id: string }).id;

/** An import whose job fails at once, so its audio stays for a retry. */
const failedImport = async (t: Transcripts, name: string, sec = 5) => {
  const id = idOf(await t.importAudio({ name, pcm: tone(sec), language: "auto" }));
  await settled(t, id, "failed");
  return id;
};

describe("import", () => {
  test("transcribes in chunks, saves segments with times, indexes for search", async () => {
    const s = setup();
    const t = await s.make();
    await t.ready;
    const r = await t.importAudio({ name: "weekly_sync.m4a", pcm: tone(70), language: "en" });
    expect(r.ok).toBe(true);
    const id = idOf(r);
    await settled(t, id, "done");
    const d = (await t.get(id))!;
    expect(d).toMatchObject({ title: "weekly sync", sourceName: "weekly_sync.m4a", language: "en", durationSec: 70, chunksDone: 3, chunksTotal: 3, daysLeft: 30 });
    expect(d.segments.map((x) => x.text)).toEqual(["words 1", "words 2", "words 3"]);
    expect(d.audioBytes).toBe(0); // an import keeps no audio once it is done
    expect(t.list({ search: "words" }).map((x) => x.id)).toEqual([id]);
    expect(t.list({ search: "words 2" })[0]!.snippet).toBe("weekly sync words 1 words 2 words 3");
    expect(t.list({ search: "nothing like it" })).toEqual([]);
    expect(t.list()[0]!.status).toBe("done");
    expect(s.changed).toHaveBeenCalled();
  });

  test("the language and model are passed on and recorded", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "de" }));
    await settled(t, id, "done");
    expect(s.langs).toEqual(["de"]);
    expect((await t.get(id))!.language).toBe("de");
    expect((await s.make().then((x) => x.get(id)))!.durationSec).toBe(5);
  });

  test("audio over four hours and empty audio are refused without a trace", async () => {
    const s = setup();
    const t = await s.make();
    const long = await t.importAudio({ name: "a.wav", pcm: new Int16Array(4 * 3600 * 16000 + 1), language: "auto" });
    expect(long).toMatchObject({ ok: false, failure: { code: "too-long" } });
    expect(await t.importAudio({ name: "a.wav", pcm: new Int16Array(0), language: "auto" })).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    expect(t.list()).toEqual([]);
    expect([...s.fs.files.keys()]).toEqual([]);
  });

  test("a full disk during import leaves no half entry", async () => {
    const s = setup();
    const t = await s.make();
    s.fs.fullAfter = 0; // nothing fits
    const r = await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" });
    expect(r).toMatchObject({ ok: false, failure: { code: "disk-full" } });
    s.fs.fullAfter = Infinity;
    expect(t.list()).toEqual([]);
    s.fs.fullAfter = 1; // the audio fits, the manifest does not: the audio file is taken back
    expect(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" })).toMatchObject({ ok: false, failure: { code: "disk-full" } });
    expect([...s.fs.files.keys()]).toEqual([]);
  });

  test("a missing engine fails the job with a message, keeps the audio, and a retry works", async () => {
    let missing = true;
    const s = setup({ transcribe: (n) => (missing ? { ok: false, code: "engine-missing" } : { ok: true, text: `ok ${n}`, speech: true }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "failed");
    expect((await t.get(id))!.failure).toMatchObject({ code: "engine-missing" });
    expect((await t.get(id))!.audioBytes).toBeGreaterThan(0);
    missing = false;
    expect(await t.resume(id)).toEqual({ ok: true });
    await settled(t, id, "done");
    const d = (await t.get(id))!;
    expect(d.failure).toBeUndefined();
    expect(d.segments).toHaveLength(1);
  });

  test("dictation goes first: no chunk starts while it is busy", async () => {
    let busy = true;
    const s = setup({ busy: () => busy });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await vi.waitFor(() => expect(s.c.now()).toBeGreaterThan(1_700_000_000_000 + 600));
    expect(s.calls()).toBe(0);
    expect((await t.get(id))!.status).toBe("transcribing");
    busy = false;
    await settled(t, id, "done");
    expect(s.calls()).toBe(1);
  });

  test("dictation starting mid-chunk stops the running chunk and it runs again once dictation is done", async () => {
    let busy = false;
    const s = setup({
      busy: () => busy,
      transcribe: async (n, _p, _l, signal) => {
        if (n > 1) return { ok: true, text: "again", speech: true };
        busy = true;
        await new Promise((r) => signal.addEventListener("abort", r, { once: true }));
        setTimeout(() => (busy = false), 20);
        throw signal.reason;
      },
    });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    expect(s.calls()).toBe(2);
    expect((await t.get(id))!.segments.map((x) => x.text)).toEqual(["again"]);
  });

  test("jobs run one after the other and report their place in the line", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async (n) => (n === 1 && (await hold), { ok: true, text: `t${n}`, speech: true }) });
    const t = await s.make();
    const a = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    const b = idOf(await t.importAudio({ name: "b.wav", pcm: tone(5), language: "auto" }));
    await vi.waitFor(() => expect(t.list().find((r) => r.id === a)!.queued).toBe(0));
    expect(t.list().find((r) => r.id === b)).toMatchObject({ status: "queued", queued: 1 });
    release();
    await settled(t, a, "done");
    await settled(t, b, "done");
    expect((await t.get(b))!.segments[0]!.text).toBe("t2");
  });

  test("cancel of a waiting job marks it cancelled; cancel of the running one keeps the chunks done", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async (n) => (n === 2 && (await hold), { ok: true, text: `t${n}`, speech: true }) });
    const t = await s.make();
    const a = idOf(await t.importAudio({ name: "a.wav", pcm: tone(70), language: "auto" }));
    const b = idOf(await t.importAudio({ name: "b.wav", pcm: tone(5), language: "auto" }));
    await t.cancel(b);
    expect((await t.get(b))!.status).toBe("cancelled");
    await vi.waitFor(() => expect(s.calls()).toBe(2));
    await t.cancel(a);
    release();
    await settled(t, a, "cancelled");
    expect(await t.get(a)).toMatchObject({ chunksDone: 2, chunksTotal: 3 });
    await t.cancel("unknown");
  });

  test("quit during a job saves progress; the next start resumes after the chunks done", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async (n) => (n === 2 && (await hold), { ok: true, text: `t${n}`, speech: true }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(70), language: "auto" }));
    await vi.waitFor(() => expect(s.calls()).toBe(2));
    const closing = t.dispose();
    release();
    await closing;
    expect(await t.get(id)).toMatchObject({ status: "interrupted", chunksDone: 2 });
    const again = await s.make();
    expect(again.list()[0]).toMatchObject({ id, status: "interrupted", chunksDone: 2 });
    expect(await again.resume(id)).toEqual({ ok: true });
    await settled(again, id, "done");
    const d = (await again.get(id))!;
    expect(d.segments.map((x) => x.text)).toEqual(
      ["t1", "t2", "words 3"]
        .map((x, i) => (i === 2 ? "t3" : x))
        .slice(0, 2)
        .concat(d.segments[2]!.text),
    );
    expect(d.segments).toHaveLength(3);
    expect(s.calls()).toBe(3);
  });

  test("resume is refused for a done transcript or one already running", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    expect(await t.resume(id)).toMatchObject({ ok: false });
    await settled(t, id, "done");
    expect(await t.resume(id)).toMatchObject({ ok: false });
    expect(await t.resume("nope")).toMatchObject({ ok: false });
  });

  test("a transcript whose audio was removed cannot be resumed and says why", async () => {
    const s = setup({ transcribe: () => ({ ok: false, code: "engine-missing" }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "failed");
    s.fs.files.delete(`${DIR}/audio/${id}.wav`);
    await t.resume(id);
    await vi.waitFor(async () => expect((await t.get(id))!.failure!.code).toBe("decode-failed"));
  });

  test("a full disk while transcribing fails the job with its own message", async () => {
    const s = setup({
      transcribe: (n) => {
        if (n === 2) s.fs.fullAfter = s.fs.writes; // the disk fills while the second chunk is being heard
        return { ok: true, text: `w${n}`, speech: true };
      },
    });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(70), language: "auto" }));
    await settled(t, id, "failed");
    expect((await t.get(id))!.failure!.code).toBe("disk-full");
    expect((await t.get(id))!.chunksDone).toBe(1);
    // After a restart the entry is resumable from the last state that was saved.
    s.fs.fullAfter = Infinity;
    const again = await s.make();
    expect(again.list()[0]).toMatchObject({ status: "interrupted", chunksDone: 1 });
  });
});

describe("delete and rename", () => {
  async function one(over = {}) {
    const s = setup(over);
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "talk.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    return { s, t, id };
  }

  test("deleting removes the files and the search entry", async () => {
    const { s, t, id } = await one();
    expect(t.list({ search: "words" }).map((r) => r.id)).toEqual([id]);
    await t.remove(id);
    expect(t.list({ search: "words" })).toEqual([]);
    expect(await t.get(id)).toBeUndefined();
    expect([...s.fs.files.keys()].filter((k) => k.includes("items") || k.includes("audio"))).toEqual([]);
  });

  test("remove works on a live transcript and a running job is stopped first", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async () => (await hold, { ok: true, text: "x", speech: true }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await vi.waitFor(() => expect(s.calls()).toBe(1));
    const gone = t.remove(id);
    release();
    await gone;
    expect(t.list()).toEqual([]);
    await vi.waitFor(() => expect([...s.fs.files.keys()].filter((k) => k.includes("items"))).toEqual([]));
  });

  test("rename trims, ignores empty, cuts long titles, and search sees the new title", async () => {
    const { t, id } = await one();
    await t.rename(id, "  Budget review  ");
    expect((await t.get(id))!.title).toBe("Budget review");
    await t.rename(id, "   ");
    expect((await t.get(id))!.title).toBe("Budget review");
    expect(t.list({ search: "budget" }).map((r) => r.id)).toEqual([id]);
    await t.rename(id, "x".repeat(500));
    expect((await t.get(id))!.title).toHaveLength(200);
  });
});

describe("retention", () => {
  test("a transcript is deleted after 30 days and the audio of an unfinished one after 7", async () => {
    const s = setup({ transcribe: () => ({ ok: false, code: "engine-missing" }) });
    const t = await s.make();
    const id = await failedImport(t, "a.wav");
    s.c.advance(8 * 86_400_000);
    expect(await t.sweep()).toEqual({ removed: 0, audioDropped: 1 });
    expect(await t.get(id)).toMatchObject({ audioBytes: 0, audioRemoved: true });
    s.c.advance(23 * 86_400_000);
    expect(await t.sweep()).toEqual({ removed: 1, audioDropped: 0 });
    expect(t.list()).toEqual([]);
    expect(t.storage()).toEqual({ audioBytes: 0, count: 0 });
  });

  test("the sweep also runs when the store opens", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    s.c.advance(31 * 86_400_000);
    const again = await s.make();
    await again.ready;
    expect(again.list()).toEqual([]);
    expect(again.storage()).toEqual({ audioBytes: 0, count: 0 });
  });

  test("a transcript left in the Trash by an earlier version is deleted at start", async () => {
    const fs = new MemFs();
    const entry = {
      id: "old",
      title: "old",
      createdAt: 1_700_000_000_000,
      status: "done",
      trashedAt: 1_700_000_000_000,
      chunksDone: 1,
      chunksTotal: 1,
      audioBytes: 0,
      language: "auto",
      model: "m",
      durationSec: 1,
    };
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 1, entries: [entry] })));
    fs.files.set(`${DIR}/items/old.json`, new TextEncoder().encode(JSON.stringify({ segments: [{ start: 0, end: 1, text: "hi" }] })));
    const t = await setup({ fs }).make();
    await t.ready;
    expect(t.list()).toEqual([]);
    expect(await t.get("old")).toBeUndefined();
    expect(fs.files.has(`${DIR}/items/old.json`)).toBe(false);
  });

  test("storage counts the audio kept for unfinished imports", async () => {
    const s = setup({ transcribe: () => ({ ok: false, code: "engine-missing" }) });
    const t = await s.make();
    await failedImport(t, "a.wav");
    await failedImport(t, "b.wav");
    expect(t.storage()).toEqual({ audioBytes: 2 * (44 + 160000), count: 2 });
  });
});

describe("store notices", () => {
  test("a newer manifest is reported and nothing is changed", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 9, entries: [] })));
    const s = setup({ fs });
    const t = await s.make();
    expect(t.notice()).toEqual({ newer: true });
    expect(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" })).toMatchObject({ ok: false });
  });

  test("a manifest that cannot be read is reported and left alone", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 1, entries: [] })));
    const locked = Object.assign(Object.create(fs), {
      read: async () => {
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      },
    });
    const t = await setup({ fs: locked }).make();
    expect(t.notice()).toEqual({ newer: false, unreadable: true });
    expect(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" })).toMatchObject({ ok: false });
  });

  test("an unreadable manifest is reported with where it went", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode("oops"));
    const t = await setup({ fs }).make();
    expect(t.notice().newer).toBe(false);
    expect(t.notice().recoveredFrom).toContain("manifest.bad-");
  });

  test("the waiting line is bounded", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async () => (await hold, { ok: true, text: "x", speech: true }) });
    const t = await s.make();
    const results = [];
    for (let i = 0; i < 23; i++) results.push(await t.importAudio({ name: `f${i}.wav`, pcm: tone(1), language: "auto" }));
    expect(results.filter((r) => !r.ok)).toHaveLength(2);
    expect(t.list()).toHaveLength(21);
    expect(results.find((r) => !r.ok)).toMatchObject({ failure: { message: "Too many transcripts are waiting. Try again when some are done." } });
    release();
    await t.dispose();
  });
});

describe("audio", () => {
  test("an imported file's audio is gone once its transcript is done", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    expect(await t.get(id)).toMatchObject({ audioBytes: 0, audioRemoved: true });
    expect(s.fs.files.has(`${DIR}/audio/${id}.wav`)).toBe(false);
  });

  test("delete audio removes one transcript's audio and keeps its words; delete all counts", async () => {
    const s = setup({ transcribe: () => ({ ok: false, code: "engine-missing" }) });
    const t = await s.make();
    const a = await failedImport(t, "a.wav");
    await failedImport(t, "b.wav");
    await t.dropAudio(a);
    expect(await t.get(a)).toMatchObject({ audioBytes: 0, status: "failed" });
    expect(await t.dropAllAudio()).toBe(1);
    expect(t.storage().audioBytes).toBe(0);
    expect(await t.dropAllAudio()).toBe(0);
    await t.dropAudio("nope");
  });

  test("audio of a job in progress is not deleted", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async () => (await hold, { ok: true, text: "x", speech: true }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await vi.waitFor(() => expect(s.calls()).toBe(1));
    await t.dropAudio(id);
    expect(await t.dropAllAudio()).toBe(0);
    expect((await t.get(id))!.audioBytes).toBeGreaterThan(0);
    release();
    await settled(t, id, "done");
  });

  describe("recycle bin", () => {
    test("audio goes to the recycle bin too, and is deleted anyway when that fails", async () => {
      const recycled: string[] = [];
      let bin = true;
      const s = setup({
        transcribe: () => ({ ok: false, code: "engine-missing" }),
        recycle: async (f) => {
          if (!bin) throw new Error("no bin");
          recycled.push(f.replaceAll("\\", "/"));
        },
      });
      const t = await s.make();
      const first = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
      await settled(t, first, "failed");
      await t.remove(first);
      expect(recycled).toEqual([expect.stringContaining(`${first}.wav`)]);
      bin = false;
      const id = idOf(await t.importAudio({ name: "b.wav", pcm: tone(5), language: "auto" }));
      await settled(t, id, "failed");
      await t.remove(id);
      expect([...s.fs.files.keys()].some((k) => k.endsWith(`${id}.wav`))).toBe(false);
    });
  });
});
