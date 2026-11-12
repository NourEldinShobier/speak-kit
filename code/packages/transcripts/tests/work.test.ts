import { describe, expect, test, vi } from "vitest";
import {
  audioTotal,
  createGate,
  daysLeft,
  decodeWav,
  decodeWavAsync,
  DEFAULT_POLICY,
  DiskFullError,
  encodeWav16k,
  JobQueue,
  normalizePolicy,
  planChunks,
  QueueFullError,
  runJob,
  sweep,
  wavInfo,
  WavError,
} from "../src";
import type { ChunkResult, Entry } from "../src";
import { tone } from "./fakes";

const DAY = 86_400_000;
const ok = (text: string): ChunkResult => ({ ok: true, text, speech: true });

describe("planChunks", () => {
  test("short audio is one chunk; empty audio none", () => {
    expect(planChunks(tone(20))).toEqual([{ from: 0, to: 320000 }]);
    expect(planChunks(new Int16Array(0))).toEqual([]);
    expect(planChunks(tone(35))).toEqual([{ from: 0, to: 560000 }]);
  });

  test("cuts in the quietest moment before the target", () => {
    const pcm = tone(70);
    pcm.fill(0, 26 * 16000, 26.1 * 16000 + 1); // a pause between 26.0 and 26.1 s
    const plan = planChunks(pcm);
    expect(plan[0]!.from).toBe(0);
    expect(plan[0]!.to).toBe(26.05 * 16000);
    expect(plan.at(-1)!.to).toBe(pcm.length);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.from).toBe(plan[i - 1]!.to);
  });

  test("no chunk is over the maximum and the plan covers everything", () => {
    const plan = planChunks(tone(600, 100), { targetSec: 10, maxSec: 12, searchSec: 3 });
    expect(plan.every((c) => c.to - c.from <= 12 * 16000 && c.to > c.from)).toBe(true);
    expect(plan.reduce((n, c) => n + (c.to - c.from), 0)).toBe(600 * 16000);
  });

  test("silence (all equal) cuts at the earliest quiet frame, same plan every time", () => {
    const a = planChunks(tone(100, 0));
    expect(a).toEqual(planChunks(tone(100, 0)));
    expect(a[0]!.to).toBe(22 * 16000 + 800);
  });
});

describe("wav", () => {
  const header = (o: { format?: number; channels: number; rate: number; bits: number; data: Uint8Array; extra?: boolean }) => {
    const out = new Uint8Array(44 + (o.extra ? 12 : 0) + o.data.length);
    const dv = new DataView(out.buffer);
    const tag = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
    tag(0, "RIFF");
    tag(8, "WAVE");
    let at = 12;
    if (o.extra) {
      tag(at, "LIST");
      dv.setUint32(at + 4, 3, true); // odd size: padded to even
      at += 12;
    }
    tag(at, "fmt ");
    dv.setUint32(at + 4, 16, true);
    dv.setUint16(at + 8, o.format ?? 1, true);
    dv.setUint16(at + 10, o.channels, true);
    dv.setUint32(at + 12, o.rate, true);
    dv.setUint16(at + 22, o.bits, true);
    tag(at + 24, "data");
    dv.setUint32(at + 28, o.data.length, true);
    out.set(o.data, at + 32);
    return out;
  };
  const i16 = (...v: number[]) => new Uint8Array(new Int16Array(v).buffer);

  test("encode then decode returns the same samples", () => {
    const pcm = Int16Array.from([0, 1000, -1000, 32767, -32767]);
    const wav = encodeWav16k(pcm);
    expect(wav.length).toBe(44 + 10);
    expect(wavInfo(wav)).toMatchObject({ format: 1, channels: 1, rate: 16000, bits: 16, dataStart: 44, dataEnd: 54 });
    expect([...decodeWav(wav)]).toEqual([...pcm]);
  });

  test("stereo is averaged to mono", () => {
    const wav = header({ channels: 2, rate: 16000, bits: 16, data: i16(1000, 3000, -2000, 0) });
    expect([...decodeWav(wav)]).toEqual([2000, -1000]);
  });

  test("8-bit, 24-bit, 32-bit and float formats", () => {
    expect([...decodeWav(header({ channels: 1, rate: 16000, bits: 8, data: Uint8Array.from([128, 255, 0]) }))]).toEqual([0, 32512, -32768]);
    const b24 = Uint8Array.from([0, 0, 0x40, 0, 0, 0xc0]); // +0.5 and -0.5
    expect([...decodeWav(header({ channels: 1, rate: 16000, bits: 24, data: b24 }))]).toEqual([16384, -16384]);
    const b32 = new Uint8Array(new Int32Array([1 << 30]).buffer);
    expect([...decodeWav(header({ channels: 1, rate: 16000, bits: 32, data: b32 }))]).toEqual([16384]);
    const f32 = new Uint8Array(new Float32Array([0.5, -2]).buffer);
    expect([...decodeWav(header({ format: 3, channels: 1, rate: 16000, bits: 32, data: f32 }))]).toEqual([16384, -32768]);
    const f64 = new Uint8Array(new Float64Array([0.25]).buffer);
    expect([...decodeWav(header({ format: 3, channels: 1, rate: 16000, bits: 64, data: f64 }))]).toEqual([8192]);
  });

  test("other sample rates are resampled to 16 kHz", () => {
    const wav = header({ channels: 1, rate: 48000, bits: 16, data: new Uint8Array(new Int16Array(4800).fill(1000).buffer) });
    const out = decodeWav(wav);
    expect(out.length).toBe(1600);
    expect(out[800]).toBe(1000);
    const up = decodeWav(header({ channels: 1, rate: 8000, bits: 16, data: i16(0, 16384) }));
    expect([...up]).toEqual([0, 8192, 16384, 16384]);
  });

  test("chunks before the data are skipped, a streamed size is clamped to the file", () => {
    const wav = header({ channels: 1, rate: 16000, bits: 16, data: i16(100, 200), extra: true });
    expect(decodeWav(wav).length).toBe(2);
    const dv = new DataView(wav.buffer);
    dv.setUint32(12 + 12 + 24 + 4, 0xffffffff, true);
    expect(decodeWav(wav).length).toBe(2);
  });

  test("bad files throw WavError", () => {
    expect(() => wavInfo(new Uint8Array(4))).toThrow(WavError);
    expect(() => wavInfo(new TextEncoder().encode("RIFF\0\0\0\0WAVEjunkjunkjunk"))).toThrow("no audio data");
    expect(() => decodeWav(header({ format: 2, channels: 1, rate: 16000, bits: 16, data: i16(1) }))).toThrow("unsupported WAVE format 2/16");
    expect(() => decodeWav(header({ format: 3, channels: 1, rate: 16000, bits: 16, data: i16(1) }))).toThrow(WavError);
    expect(() => decodeWav(header({ channels: 0, rate: 16000, bits: 16, data: i16(1) }))).toThrow(WavError);
    const dataFirst = new Uint8Array(44);
    [..."RIFF"].forEach((c, i) => (dataFirst[i] = c.charCodeAt(0)));
    [..."WAVE"].forEach((c, i) => (dataFirst[8 + i] = c.charCodeAt(0)));
    [..."data"].forEach((c, i) => (dataFirst[12 + i] = c.charCodeAt(0)));
    expect(() => wavInfo(dataFirst)).toThrow("data before fmt");
  });

  test("a large file can be converted with pauses, giving the same samples", async () => {
    const data = new Uint8Array(new Int16Array(2 * 1_100_000 * 3).fill(2000).buffer); // stereo, 1.1 million frames per step, at 48 kHz
    const wav = header({ channels: 2, rate: 48000, bits: 16, data });
    let pauses = 0;
    const out = await decodeWavAsync(wav, async () => void pauses++);
    expect(out.length).toBe(1_100_000);
    expect(pauses).toBe(1);
    expect(out[500_000]).toBe(2000);
    expect(decodeWav(wav)).toEqual(out);
  });
});

describe("runJob", () => {
  const pcm = tone(100); // three or four chunks
  const run = (
    transcribe: (n: number) => ChunkResult | Promise<ChunkResult>,
    extra: Partial<Parameters<typeof runJob>[0]> = {},
    signal = new AbortController().signal,
    resume?: { chunksDone: number; segments: { start: number; end: number; text: string }[] },
  ) => {
    let n = 0;
    return runJob({ transcribe: async () => transcribe(++n), ...extra }, { pcm, language: "en", signal, ...(resume && { resume }) });
  };

  test("transcribes every chunk, with the chunk's times, and reports progress after each", async () => {
    const seen: [number, number, number][] = [];
    const r = await run((n) => ok(` part ${n} `), { checkpoint: (d, t, s) => void seen.push([d, t, s.length]) });
    expect(r.status).toBe("done");
    expect(r.chunksTotal).toBe(4);
    expect(r.chunksDone).toBe(4);
    expect(r.segments.map((s) => s.text)).toEqual(["part 1", "part 2", "part 3", "part 4"]);
    expect(r.segments[0]!.start).toBe(0);
    expect(r.segments[3]!.end).toBe(100);
    expect(seen).toEqual([
      [1, 4, 1],
      [2, 4, 2],
      [3, 4, 3],
      [4, 4, 4],
    ]);
  });

  test("a chunk without speech or with empty text adds no segment but counts as done", async () => {
    const r = await run((n) => (n === 1 ? { ok: true, text: "noise", speech: false } : n === 2 ? ok("   ") : ok("x")));
    expect(r.segments.map((s) => s.text)).toEqual(["x", "x"]);
    expect(r.chunksDone).toBe(4);
  });

  test("a failing chunk is tried once more; two failures stop the job with what is done kept", async () => {
    const calls: number[] = [];
    const r = await run((n) => (calls.push(n), n === 1 ? ok("first") : { ok: false, code: "failed" }));
    expect(calls).toEqual([1, 2, 3]);
    expect(r).toMatchObject({ status: "failed", chunksDone: 1, failure: { code: "failed" } });
    expect(r.segments.map((s) => s.text)).toEqual(["first"]);
    const retried = await run((n) => (n === 1 ? { ok: false, code: "failed" } : ok("fine")));
    expect(retried.status).toBe("done");
  });

  test("a missing or loading model stops at once with its own message and no retry", async () => {
    let calls = 0;
    const r = await runJob({ transcribe: async () => (calls++, { ok: false, code: "engine-missing" }) }, { pcm, language: "en", signal: new AbortController().signal });
    expect(calls).toBe(1);
    expect(r.failure!.code).toBe("engine-missing");
    const l = await run(() => ({ ok: false, code: "engine-loading" }));
    expect(l.failure!.code).toBe("engine-loading");
  });

  test("an engine that throws counts as a failed chunk", async () => {
    const r = await runJob({ transcribe: async () => Promise.reject(new Error("boom")) }, { pcm, language: "en", signal: new AbortController().signal });
    expect(r).toMatchObject({ status: "failed", failure: { code: "failed" }, chunksDone: 0 });
  });

  test("a hung chunk is aborted at its deadline and retried", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const p = runJob(
        {
          deadlineMs: () => 1000,
          transcribe: (_p, _l, signal) => {
            calls++;
            if (calls === 1) return new Promise<ChunkResult>((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
            return Promise.resolve(ok("recovered"));
          },
        },
        { pcm: tone(10), language: "en", signal: new AbortController().signal },
      );
      await vi.advanceTimersByTimeAsync(1001);
      const r = await p;
      expect(calls).toBe(2);
      expect(r.status).toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the default deadline grows with the chunk length", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const p = runJob(
        { transcribe: (_p, _l, s) => new Promise<ChunkResult>((res) => s.addEventListener("abort", () => ((aborted = true), res({ ok: false, code: "engine-missing" })))) },
        { pcm: tone(10), language: "en", signal: new AbortController().signal },
      );
      await vi.advanceTimersByTimeAsync(20_000 + 10 * 6_000 - 1);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(aborted).toBe(true);
      await p;
    } finally {
      vi.useRealTimers();
    }
  });

  test("cancel keeps what is done; a quit says interrupted", async () => {
    for (const [reason, status] of [
      ["cancel", "cancelled"],
      ["quit", "interrupted"],
    ] as const) {
      const ctl = new AbortController();
      const r = await run((n) => (n === 2 && ctl.abort(reason), ok(`c${n}`)), {}, ctl.signal);
      expect(r.status).toBe(status);
      expect(r.chunksDone).toBe(2);
      expect(r.segments).toHaveLength(2);
    }
  });

  test("an abort while the chunk runs is passed to the engine and ends the job", async () => {
    const ctl = new AbortController();
    let passed = false;
    const p = runJob(
      {
        transcribe: (_p, _l, s) =>
          new Promise<ChunkResult>((res) =>
            s.addEventListener("abort", () => {
              passed = s.reason === "quit";
              res({ ok: false, code: "failed" });
            }),
          ),
      },
      { pcm, language: "en", signal: ctl.signal },
    );
    setTimeout(() => ctl.abort("quit"), 0);
    const r = await p;
    expect(passed).toBe(true);
    expect(r).toMatchObject({ status: "interrupted", chunksDone: 0 });
  });

  test("a job aborted before it starts does nothing", async () => {
    const ctl = new AbortController();
    ctl.abort("cancel");
    let calls = 0;
    const r = await run(() => (calls++, ok("x")), {}, ctl.signal);
    expect(calls).toBe(0);
    expect(r).toMatchObject({ status: "cancelled", chunksDone: 0, segments: [] });
  });

  test("resume starts after the chunks already done and keeps their segments", async () => {
    const seg = [{ start: 0, end: 22, text: "earlier" }];
    const r = await run((n) => ok(`new ${n}`), {}, new AbortController().signal, { chunksDone: 1, segments: seg });
    expect(r.segments.map((s) => s.text)).toEqual(["earlier", "new 1", "new 2", "new 3"]);
    expect(r.chunksDone).toBe(4);
    const all = await run(() => ok("never"), {}, new AbortController().signal, { chunksDone: 99, segments: seg });
    expect(all).toMatchObject({ status: "done", chunksDone: 4 });
    expect(all.segments).toEqual(seg);
  });

  test("the gate is waited on before every chunk, and a cancel while waiting ends it", async () => {
    const order: string[] = [];
    await run((n) => (order.push(`t${n}`), ok("x")), { clear: async () => void order.push("clear") });
    expect(order.slice(0, 4)).toEqual(["clear", "t1", "clear", "t2"]);
    const ctl = new AbortController();
    const r = await run(() => ok("x"), { clear: async () => ctl.abort("cancel") }, ctl.signal);
    expect(r).toMatchObject({ status: "cancelled", chunksDone: 0 });
  });

  test("a checkpoint that fails ends the job: disk full has its own message", async () => {
    const full = await run(() => ok("x"), { checkpoint: () => Promise.reject(new DiskFullError()) });
    expect(full).toMatchObject({ status: "failed", failure: { code: "disk-full" }, chunksDone: 0, segments: [] });
    const other = await run(() => ok("x"), { checkpoint: () => Promise.reject(new Error("EIO")) });
    expect(other.failure!.code).toBe("failed");
  });

  test("an empty recording is done with nothing", async () => {
    const r = await runJob({ transcribe: async () => ok("x") }, { pcm: new Int16Array(0), language: "en", signal: new AbortController().signal });
    expect(r).toEqual({ status: "done", segments: [], chunksDone: 0, chunksTotal: 0 });
  });
});

describe("JobQueue", () => {
  const gate = () => {
    let release!: () => void;
    const p = new Promise<void>((r) => (release = r));
    return { p, release };
  };

  test("runs one at a time in order", async () => {
    const q = new JobQueue();
    const log: string[] = [];
    const g = gate();
    expect(q.add("a", async () => (log.push("a"), g.p))).toBe(0);
    expect(q.add("b", async () => void log.push("b"))).toBe(1);
    expect(q.add("c", async () => void log.push("c"))).toBe(2);
    expect(q.running).toBe("a");
    expect(q.waiting).toEqual(["b", "c"]);
    expect(q.add("b", async () => {})).toBe(1);
    expect(q.add("a", async () => {})).toBe(0);
    g.release();
    await vi.waitFor(() => expect(log).toEqual(["a", "b", "c"]));
    await vi.waitFor(() => expect(q.running).toBeUndefined());
    expect(q.has("a")).toBe(false);
  });

  test("refuses past the limit", () => {
    const q = new JobQueue(2);
    const g = gate();
    q.add("run", () => g.p);
    q.add("w1", () => g.p);
    q.add("w2", () => g.p);
    expect(() => q.add("w3", () => g.p)).toThrow(QueueFullError);
    expect(() => q.add("w3", () => g.p)).toThrow("2 jobs are already waiting.");
    g.release();
  });

  test("cancel drops a waiting job and aborts the running one with the reason", async () => {
    const q = new JobQueue();
    let reason: unknown;
    const g = gate();
    q.add("a", async (s) => {
      s.addEventListener("abort", () => (reason = s.reason));
      await g.p;
    });
    q.add("b", async () => {});
    expect(q.cancel("b")).toBe(true);
    expect(q.waiting).toEqual([]);
    expect(q.cancel("nope")).toBe(false);
    expect(q.cancel("a", "quit")).toBe(true);
    expect(reason).toBe("quit");
    g.release();
  });

  test("a job that throws does not stop the queue; stopAll aborts and returns the waiting", async () => {
    const q = new JobQueue();
    const done: string[] = [];
    q.add("bad", async () => Promise.reject(new Error("x")));
    q.add("good", async () => void done.push("good"));
    await vi.waitFor(() => expect(done).toEqual(["good"]));
    const g = gate();
    let sig: AbortSignal | undefined;
    q.add("r", async (s) => ((sig = s), g.p));
    q.add("w", async () => {});
    expect(q.stopAll("quit")).toEqual(["w"]);
    expect(sig!.reason).toBe("quit");
    g.release();
  });
});

describe("gate", () => {
  test("waits while dictation is busy, polling, and stops when aborted", async () => {
    let busy = true;
    let polls = 0;
    const clear = createGate({ busy: () => busy, sleep: async () => void (++polls === 3 && (busy = false)), pollMs: 50 });
    await clear(new AbortController().signal);
    expect(polls).toBe(3);
    busy = true;
    const ctl = new AbortController();
    ctl.abort();
    await clear(ctl.signal);
    let free = 0;
    await createGate({ busy: () => false, sleep: async () => void free++ })(new AbortController().signal);
    expect(free).toBe(0);
  });

  test("polls at the given interval", async () => {
    const waits: number[] = [];
    let n = 0;
    await createGate({ busy: () => n++ < 2, sleep: async (ms) => void waits.push(ms) })(new AbortController().signal);
    expect(waits).toEqual([200, 200]);
  });
});

describe("retention", () => {
  const e = (over: Partial<Entry> & { id: string }): Entry => ({
    title: "t",
    createdAt: 0,
    source: "microphone",
    durationSec: 1,
    language: "auto",
    model: "m",
    status: "done",
    chunksDone: 1,
    chunksTotal: 1,
    audioBytes: 0,
    exports: [],
    ...over,
  });
  const policy = { textDays: 30, audioDays: 7, audioCapBytes: null, trashDays: 10, keepAudio: true };

  test("normalizing keeps audio no longer than text and days whole and at least one", () => {
    expect(normalizePolicy({ textDays: 10, audioDays: 30, audioCapBytes: 5, trashDays: 3, keepAudio: true })).toEqual({ textDays: 10, audioDays: 10, audioCapBytes: 5, trashDays: 3, keepAudio: true });
    expect(normalizePolicy({ textDays: 10, audioDays: null, audioCapBytes: null, trashDays: 3, keepAudio: true }).audioDays).toBe(10);
    expect(normalizePolicy({ textDays: null, audioDays: null, audioCapBytes: -4, trashDays: 0, keepAudio: true })).toEqual({
      textDays: null,
      audioDays: null,
      audioCapBytes: 0,
      trashDays: 1,
      keepAudio: true,
    });
    expect(normalizePolicy({ textDays: 2.6, audioDays: 0, audioCapBytes: null, trashDays: 3, keepAudio: true })).toMatchObject({ textDays: 3, audioDays: 1 });
    expect(normalizePolicy({ ...DEFAULT_POLICY, trashDays: Number.NaN }).trashDays).toBe(DEFAULT_POLICY.trashDays);
  });

  test("sweep moves old text to the trash, deletes old trash, drops old audio", () => {
    const now = 100 * DAY;
    const all = [
      e({ id: "fresh", createdAt: now - DAY, audioBytes: 5 }),
      e({ id: "oldtext", createdAt: now - 31 * DAY }),
      e({ id: "oldaudio", createdAt: now - 8 * DAY, audioBytes: 9 }),
      e({ id: "intrash", createdAt: 0, trashedAt: now - 11 * DAY }),
      e({ id: "freshtrash", createdAt: 0, trashedAt: now - 9 * DAY }),
    ];
    expect(sweep(all, now, policy)).toEqual({ trash: ["oldtext"], remove: ["intrash"], dropAudio: ["oldaudio"] });
  });

  test("a job in progress is never swept; boundaries are inclusive", () => {
    const now = 100 * DAY;
    const busy = ["recording", "queued", "transcribing"] as const;
    const all = busy.map((status, i) => e({ id: `b${i}`, status, createdAt: 0, audioBytes: 5 }));
    expect(sweep(all, now, policy)).toEqual({ trash: [], remove: [], dropAudio: [] });
    expect(sweep([e({ id: "x", createdAt: now - 30 * DAY })], now, policy).trash).toEqual(["x"]);
    expect(sweep([e({ id: "x", createdAt: now - 30 * DAY + 1 })], now, policy).trash).toEqual([]);
    expect(sweep([e({ id: "y", createdAt: now - 7 * DAY, audioBytes: 1 })], now, policy).dropAudio).toEqual(["y"]);
    expect(sweep([e({ id: "z", createdAt: 0, trashedAt: now - 10 * DAY })], now, policy).remove).toEqual(["z"]);
    for (const status of ["failed", "cancelled", "interrupted"] as const) expect(sweep([e({ id: "s", status, createdAt: 0 })], now, policy).trash).toEqual(["s"]);
  });

  test("forever keeps everything; the size cap drops the oldest audio first", () => {
    const now = 100 * DAY;
    const forever = { textDays: null, audioDays: null, audioCapBytes: null, trashDays: 30, keepAudio: true };
    expect(sweep([e({ id: "a", createdAt: 0, audioBytes: 9 })], now, forever)).toEqual({ trash: [], remove: [], dropAudio: [] });
    const all = [e({ id: "new", createdAt: 3, audioBytes: 60 }), e({ id: "old", createdAt: 1, audioBytes: 60 }), e({ id: "mid", createdAt: 2, audioBytes: 60 })];
    expect(sweep(all, now, { ...forever, audioCapBytes: 100 }).dropAudio).toEqual(["old", "mid"]);
    expect(sweep(all, now, { ...forever, audioCapBytes: 180 }).dropAudio).toEqual([]);
    expect(sweep(all, now, { ...forever, audioCapBytes: 0 }).dropAudio).toEqual(["old", "mid", "new"]);
  });

  test("an imported file's audio goes when its transcript is done; a failed import keeps it for a retry", () => {
    const now = 100 * DAY;
    const all = [
      e({ id: "file", source: "file", createdAt: now - 1, audioBytes: 5 }),
      e({ id: "failed", source: "file", status: "failed", createdAt: now - 1, audioBytes: 5 }),
      e({ id: "rec", createdAt: now - 1, audioBytes: 5 }),
    ];
    expect(sweep(all, now, policy).dropAudio).toEqual(["file"]);
  });

  test("with keep audio off, a finished recording's audio goes too", () => {
    const now = 100 * DAY;
    const all = [e({ id: "rec", createdAt: now - 1, audioBytes: 5 }), e({ id: "busy", status: "transcribing", createdAt: now - 1, audioBytes: 5 })];
    expect(sweep(all, now, { ...policy, keepAudio: false }).dropAudio).toEqual(["rec"]);
    expect(normalizePolicy({ ...policy, keepAudio: false }).keepAudio).toBe(false);
  });

  test("audio of a transcript about to be deleted is not counted for the cap", () => {
    const now = 100 * DAY;
    const all = [e({ id: "gone", createdAt: 0, trashedAt: 0, audioBytes: 500 }), e({ id: "keep", createdAt: now - 1, audioBytes: 50 })];
    expect(sweep(all, now, { textDays: null, audioDays: null, audioCapBytes: 100, trashDays: 1, keepAudio: true }).dropAudio).toEqual([]);
  });

  test("days left counts whole days up and never goes below zero", () => {
    const now = 100 * DAY;
    expect(daysLeft(e({ id: "a", createdAt: now - 10 * DAY }), now, policy)).toBe(20);
    expect(daysLeft(e({ id: "a", createdAt: now - 29.5 * DAY }), now, policy)).toBe(1);
    expect(daysLeft(e({ id: "a", createdAt: 0 }), now, policy)).toBe(0);
    expect(daysLeft(e({ id: "a", createdAt: 0, trashedAt: now - 4 * DAY }), now, policy)).toBe(6);
    expect(daysLeft(e({ id: "a", createdAt: 0 }), now, { ...policy, textDays: null })).toBeNull();
  });

  test("audio total", () => {
    expect(audioTotal([e({ id: "a", audioBytes: 3 }), e({ id: "b", audioBytes: 4 })])).toBe(7);
    expect(audioTotal([])).toBe(0);
  });
});
