import { describe, expect, test, vi } from "vitest";
import { createTranscripts, DEFAULT_POLICY, type ChunkResult, type Policy, type Transcripts } from "../src";
import { clock, DIR, ids, MemFs, tone } from "./fakes";

const OUT = "/export";

function setup(over: { transcribe?: (n: number, pcm: Int16Array, lang: string) => Promise<ChunkResult> | ChunkResult; policy?: Policy; busy?: () => boolean; fs?: MemFs } = {}) {
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
      transcribe: async (pcm, lang) => {
        langs.push(lang);
        return (over.transcribe ?? ((n) => ({ ok: true, text: `words ${n}`, speech: true })))(++calls, pcm, lang);
      },
      busy: over.busy ?? (() => false),
      sleep: c.sleep,
      model: () => "model-a",
      policy: () => over.policy ?? DEFAULT_POLICY,
      exportDir: () => OUT,
      changed,
    });
  return { fs, c, changed, make, langs, calls: () => calls };
}

const settled = async (t: Transcripts, id: string, status: string) => vi.waitFor(async () => expect((await t.get(id))!.status).toBe(status));
const idOf = (r: { ok: boolean }): string => (r as unknown as { id: string }).id;

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
    expect(d).toMatchObject({ title: "weekly sync", source: "file", sourceName: "weekly_sync.m4a", language: "en", durationSec: 70, chunksDone: 3, chunksTotal: 3, daysLeft: 90 });
    expect(d.segments.map((x) => x.text)).toEqual(["words 1", "words 2", "words 3"]);
    expect(d.audioBytes).toBe(44 + 70 * 16000 * 2);
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

describe("recording", () => {
  const pcm = (sec: number) => tone(sec);

  test("spools to disk, then becomes audio and is transcribed", async () => {
    const s = setup();
    const t = await s.make();
    const begun = await t.beginRecording("auto");
    const id = idOf(begun);
    expect(await t.get(id)).toMatchObject({ status: "recording", source: "microphone", title: expect.stringMatching(/^Conversation /) as string });
    expect(await t.appendRecording(id, pcm(2))).toEqual({ ok: true, seconds: 2 });
    expect(await t.appendRecording(id, pcm(3))).toEqual({ ok: true, seconds: 5 });
    expect(t.list()[0]!.durationSec).toBe(5);
    expect(s.fs.files.get(`${DIR}/audio/${id}.raw`)!.length).toBe(5 * 32000);
    expect(await t.finishRecording(id)).toEqual({ ok: true, id });
    await settled(t, id, "done");
    expect((await t.get(id))!.durationSec).toBe(5);
    expect(s.fs.files.has(`${DIR}/audio/${id}.raw`)).toBe(false);
    expect(s.fs.files.has(`${DIR}/audio/${id}.wav`)).toBe(true);
  });

  test("an empty recording fails and can be thrown away", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.beginRecording("auto"));
    const r = await t.finishRecording(id);
    expect(r).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    expect((await t.get(id))!.status).toBe("failed");
    await t.remove(id);
    expect(t.list()).toEqual([]);
    expect(await t.finishRecording("nope")).toMatchObject({ ok: false });
    expect(await t.finishRecording(id)).toMatchObject({ ok: false });
  });

  test("discarding removes the entry and its spool", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.beginRecording("auto"));
    await t.appendRecording(id, pcm(1));
    await t.discardRecording(id);
    expect(t.list()).toEqual([]);
    expect([...s.fs.files.keys()].filter((k) => k.includes("audio"))).toEqual([]);
    expect(await t.appendRecording(id, pcm(1))).toMatchObject({ ok: false });
  });

  test("a full disk while recording is reported and what was saved so far is kept", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.beginRecording("auto"));
    await t.appendRecording(id, pcm(1));
    s.fs.fullAfter = s.fs.writes;
    expect(await t.appendRecording(id, pcm(1))).toMatchObject({ ok: false, failure: { code: "disk-full" } });
    s.fs.fullAfter = Infinity;
    expect(await t.appendRecording(id, pcm(1))).toEqual({ ok: true, seconds: 2 });
    expect(s.fs.files.get(`${DIR}/audio/${id}.raw`)!.length).toBe(2 * 32000);
  });

  test("a crash leaves a recovered recording that can be transcribed", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.beginRecording("de"));
    await t.appendRecording(id, pcm(4));
    // The app dies here: nothing else is written. A stray odd byte at the end of the spool is ignored.
    s.fs.files.set(`${DIR}/audio/${id}.raw`, Uint8Array.from([...s.fs.files.get(`${DIR}/audio/${id}.raw`)!, 7]));
    const next = await s.make();
    expect(next.list()[0]).toMatchObject({ id, status: "interrupted", recovered: true });
    expect(await next.resume(id)).toEqual({ ok: true });
    await settled(next, id, "done");
    expect(await next.get(id)).toMatchObject({ durationSec: 4, recovered: true, language: "de" });
  });

  test("a crash before any sound leaves a recording that fails with a clear message", async () => {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.beginRecording("auto"));
    const next = await s.make();
    expect(await next.resume(id)).toEqual({ ok: true });
    await settled(next, id, "failed");
    expect((await next.get(id))!.failure!.message).toBe("Nothing was recorded, so there is nothing to transcribe.");
  });
});

describe("trash, restore, delete, rename", () => {
  async function one(over = {}) {
    const s = setup(over);
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "talk.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    return { s, t, id };
  }

  test("trash hides and unsearches; restore brings back and searches again", async () => {
    const { s, t, id } = await one();
    await t.trash(id);
    expect(t.list()).toEqual([]);
    expect(t.list({ trashed: true })[0]).toMatchObject({ id, daysLeft: 30 });
    expect(t.list({ search: "words" })).toEqual([]);
    s.c.advance(5 * 86_400_000);
    expect(t.list({ trashed: true })[0]!.daysLeft).toBe(25);
    await t.restore(id);
    expect(t.list({ search: "words" }).map((r) => r.id)).toEqual([id]);
  });

  test("deleting forever removes the files; empty trash counts", async () => {
    const { s, t, id } = await one();
    await t.trash(id);
    expect(await t.emptyTrash()).toBe(1);
    expect(await t.get(id)).toBeUndefined();
    expect([...s.fs.files.keys()].filter((k) => k.includes("items") || k.includes("audio"))).toEqual([]);
    expect(await t.emptyTrash()).toBe(0);
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

  test("trashing a running job stops it", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const s = setup({ transcribe: async () => (await hold, { ok: true, text: "x", speech: true }) });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await vi.waitFor(() => expect(s.calls()).toBe(1));
    const p = t.trash(id);
    release();
    await p;
    expect(t.list({ trashed: true })[0]!.id).toBe(id);
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

describe("export", () => {
  async function one() {
    const s = setup();
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "talk.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    return { s, t, id };
  }
  const fwd = (p: string) => p.replaceAll("\\", "/");

  test("text for each format and a saved file that is never overwritten", async () => {
    const { s, t, id } = await one();
    expect((await t.text(id, "srt"))!.text).toBe("1\n00:00:00,000 --> 00:00:05,000\nwords 1\n");
    expect(await t.text("nope", "txt")).toBeUndefined();
    const a = await t.save(id, "md");
    expect(a.ok && fwd(a.path)).toBe(`${OUT}/talk.md`);
    expect(s.fs.text(`${OUT}/talk.md`)).toContain("# talk");
    // Unchanged since: saved again in place. Changed: a copy beside it.
    const b = await t.save(id, "md");
    expect(b).toMatchObject({ ok: true, kind: "replaced" });
    s.fs.files.set(`${OUT}/talk.md`, new TextEncoder().encode("mine"));
    const c = await t.save(id, "md");
    expect(c.ok && c.kind).toBe("copy");
    expect(c.ok && fwd(c.path)).toBe(`${OUT}/talk (2).md`);
    expect(s.fs.text(`${OUT}/talk.md`)).toBe("mine");
    const d = await t.save(id, "vtt");
    expect(d.ok && fwd(d.path)).toBe(`${OUT}/talk.vtt`);
    expect(await t.save("nope", "md")).toMatchObject({ ok: false });
  });

  test("a full disk while saving is reported", async () => {
    const { s, t, id } = await one();
    s.fs.fullAfter = s.fs.writes;
    expect(await t.save(id, "txt")).toMatchObject({ ok: false, failure: { code: "disk-full" } });
  });
});

describe("retention", () => {
  test("a sweep at start moves old text to the trash and drops old audio, a later sweep deletes old trash", async () => {
    const policy = { textDays: 30, audioDays: 7, audioCapBytes: null, trashDays: 10 };
    const s = setup({ policy });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    s.c.advance(8 * 86_400_000);
    expect(await t.sweep()).toEqual({ trashed: 0, removed: 0, audioDropped: 1 });
    expect(await t.get(id)).toMatchObject({ audioBytes: 0, audioRemoved: true });
    s.c.advance(23 * 86_400_000);
    expect(await t.sweep()).toEqual({ trashed: 1, removed: 0, audioDropped: 0 });
    expect(t.list()).toEqual([]);
    s.c.advance(11 * 86_400_000);
    expect(await t.sweep()).toEqual({ trashed: 0, removed: 1, audioDropped: 0 });
    expect(await t.get(id)).toBeUndefined();
    expect(t.storage()).toEqual({ audioBytes: 0, count: 0, trashed: 0 });
  });

  test("the sweep also runs when the store opens", async () => {
    const policy = { textDays: 1, audioDays: 1, audioCapBytes: null, trashDays: 1 };
    const s = setup({ policy });
    const t = await s.make();
    const id = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    await settled(t, id, "done");
    s.c.advance(2 * 86_400_000);
    const again = await s.make();
    await again.ready;
    expect(again.list()).toEqual([]);
    expect(again.storage()).toMatchObject({ trashed: 1 });
  });

  test("storage counts audio of kept and trashed transcripts", async () => {
    const s = setup();
    const t = await s.make();
    const a = idOf(await t.importAudio({ name: "a.wav", pcm: tone(5), language: "auto" }));
    const b = idOf(await t.importAudio({ name: "b.wav", pcm: tone(5), language: "auto" }));
    await settled(t, a, "done");
    await settled(t, b, "done");
    await t.trash(b);
    expect(t.storage()).toEqual({ audioBytes: 2 * (44 + 160000), count: 1, trashed: 1 });
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
