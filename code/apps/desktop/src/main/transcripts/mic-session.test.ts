import { describe, expect, it, vi } from "vite-plus/test";
import type { Outcome } from "@speakkit/transcripts";
import type { MicResult, RecordingView } from "../../shared/transcripts/contract";
import { RecordingSession, type MicPort } from "./mic-session";

const SEC = new Int16Array(16000);

function rig(over: { mic?: MicResult; append?: (id: string, pcm: Int16Array) => Promise<Outcome<{ seconds: number }>>; finish?: () => Promise<Outcome<{ id: string }>>; maxSeconds?: number } = {}) {
  let chunk: (p: Int16Array) => void = () => {};
  let level: (n: number) => void = () => {};
  let ended: () => void = () => {};
  let now = 1_000_000;
  const views: (RecordingView | null)[] = [];
  const notices: string[] = [];
  const log: string[] = [];
  let seconds = 0;
  const mic: MicPort = {
    start: async () => (log.push("mic start"), over.mic ?? { ok: true }),
    stop: async () => void log.push("mic stop"),
    onChunk: (cb) => (chunk = cb),
    onLevel: (cb) => (level = cb),
    onEnded: (cb) => (ended = cb),
  };
  const transcripts = {
    beginRecording: async () => (log.push("begin"), { ok: true as const, id: "r1" }),
    appendRecording: over.append ?? (async (_id: string, pcm: Int16Array) => ((seconds += pcm.length / 16000), { ok: true as const, seconds })),
    finishRecording: over.finish ?? (async () => (log.push("finish"), { ok: true as const, id: "r1" })),
    discardRecording: async () => void log.push("discard"),
  };
  const session = new RecordingSession({
    mic,
    transcripts,
    language: () => "de",
    now: () => now,
    changed: (v) => views.push(v),
    notice: (t) => notices.push(t),
    ...(over.maxSeconds && { maxSeconds: over.maxSeconds }),
  });
  return { session, views, notices, log, chunk: (p = SEC) => chunk(p), level: (n: number) => level(n), ended: () => ended(), advance: (ms: number) => (now += ms) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("recording session", () => {
  it("starts, spools chunks, stops, and queues the recording", async () => {
    const r = rig();
    expect(r.session.active).toBe(false);
    expect(await r.session.start()).toEqual({ ok: true, id: "r1" });
    expect(r.log).toEqual(["begin", "mic start"]);
    r.chunk();
    r.chunk();
    await flush();
    expect(r.session.view()).toMatchObject({ id: "r1", phase: "recording", seconds: 2 });
    expect(await r.session.stop()).toEqual({ ok: true, id: "r1" });
    expect(r.log).toEqual(["begin", "mic start", "mic stop", "finish"]);
    expect(r.session.view()).toBeNull();
    expect(r.session.active).toBe(false);
    expect(r.views.map((v) => v?.phase ?? null)).toEqual(["starting", "recording", "recording", "recording", "saving", null]);
    expect(r.notices).toEqual([]);
  });

  it("a second start while running is refused and a stop with nothing running says so", async () => {
    const r = rig();
    expect(await r.session.stop()).toMatchObject({ ok: false, failure: { message: "Nothing is recording." } });
    await r.session.start();
    expect(await r.session.start()).toMatchObject({ ok: false, failure: { message: "A recording is already running." } });
    expect(r.log.filter((l) => l === "begin")).toHaveLength(1);
  });

  it.each([
    ["mic-denied", "privacy settings"],
    ["mic-missing", "No microphone was found"],
    ["mic-busy", "in use by another program"],
    ["mic-failed", "could not be opened"],
  ] as const)("a microphone that cannot start (%s) leaves nothing behind and says why", async (code, text) => {
    const r = rig({ mic: { ok: false, code } });
    const out = await r.session.start();
    expect(out).toMatchObject({ ok: false, failure: { message: expect.stringContaining(text) as string } });
    expect(r.log).toEqual(["begin", "mic start", "discard"]);
    expect(r.session.active).toBe(false);
    expect(r.views.at(-1)).toBeNull();
  });

  it("a microphone page that throws is a microphone that cannot be opened", async () => {
    const r = rig();
    const bad = new RecordingSession({
      mic: { start: async () => Promise.reject(new Error("x")), stop: async () => {}, onChunk: () => {}, onLevel: () => {}, onEnded: () => {} },
      transcripts: {
        beginRecording: async () => ({ ok: true, id: "r2" }),
        appendRecording: async () => ({ ok: true, seconds: 0 }),
        finishRecording: async () => ({ ok: true, id: "r2" }),
        discardRecording: async () => {},
      },
      language: () => "auto",
      now: () => 0,
      changed: () => {},
      notice: () => {},
    });
    expect(await bad.start()).toMatchObject({ ok: false, failure: { message: expect.stringContaining("could not be opened") as string } });
    void r;
  });

  it("a store that cannot begin the recording fails the start", async () => {
    const failure = { code: "disk-full", message: "The disk is full." } as const;
    const s = new RecordingSession({
      mic: { start: async () => ({ ok: true }), stop: async () => {}, onChunk: () => {}, onLevel: () => {}, onEnded: () => {} },
      transcripts: {
        beginRecording: async () => ({ ok: false, failure }),
        appendRecording: async () => ({ ok: true, seconds: 0 }),
        finishRecording: async () => ({ ok: true, id: "x" }),
        discardRecording: async () => {},
      },
      language: () => "auto",
      now: () => 0,
      changed: () => {},
      notice: () => {},
    });
    expect(await s.start()).toEqual({ ok: false, failure });
    expect(s.active).toBe(false);
  });

  it("a recording under a second is thrown away, not transcribed", async () => {
    const r = rig();
    await r.session.start();
    r.chunk(new Int16Array(4000));
    await flush();
    expect(await r.session.stop()).toMatchObject({ ok: false, failure: { message: "Nothing was recorded, so there is nothing to transcribe." } });
    expect(r.log).toContain("discard");
    expect(r.log).not.toContain("finish");
  });

  it("reports the level while recording and no sound after ten quiet seconds", async () => {
    const r = rig();
    await r.session.start();
    r.level(0.5);
    expect(r.session.view()).toMatchObject({ level: 0.5, silent: false });
    r.advance(9_999);
    expect(r.session.view()!.silent).toBe(false);
    r.advance(1);
    expect(r.session.view()!.silent).toBe(true);
    r.level(0.3);
    expect(r.session.view()!.silent).toBe(false);
    r.level(0.001); // below the sound threshold: does not count as sound
    r.advance(10_000);
    expect(r.session.view()!.silent).toBe(true);
  });

  it("the level is zero once saving starts", async () => {
    const r = rig();
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    r.level(0.8);
    const stopping = r.session.stop();
    expect(r.session.view()).toMatchObject({ phase: "saving", level: 0, silent: false });
    await stopping;
  });

  it("a full disk ends the recording by itself, keeps what was saved, and says so", async () => {
    let n = 0;
    const r = rig({ append: async () => (++n === 2 ? { ok: false, failure: { code: "disk-full", message: "The disk is full." } } : { ok: true, seconds: n }) });
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    await flush();
    await vi.waitFor(() => expect(r.session.active).toBe(false));
    expect(r.log).toContain("finish");
    expect(r.notices).toEqual(["The disk is full. What was recorded so far is saved and is being transcribed."]);
  });

  it("another write failure ends it with its own message", async () => {
    let n = 0;
    const r = rig({ append: async () => (++n < 3 ? { ok: true, seconds: n } : { ok: false, failure: { code: "failed", message: "x" } }) });
    await r.session.start();
    r.chunk();
    r.chunk();
    r.chunk();
    await vi.waitFor(() => expect(r.notices).toHaveLength(1));
    expect(r.notices[0]).toContain("could not be saved");
  });

  it("a failure before anything was saved says that nothing was", async () => {
    const r = rig({ append: async () => ({ ok: false, failure: { code: "failed", message: "x" } }) });
    await r.session.start();
    r.chunk();
    await vi.waitFor(() => expect(r.notices).toEqual(["Recording stopped before anything was saved."]));
    expect(r.log).toContain("discard");
  });

  it("a microphone that disappears ends the recording and keeps it", async () => {
    const r = rig();
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    r.ended();
    await vi.waitFor(() => expect(r.session.active).toBe(false));
    expect(r.log).toContain("finish");
    expect(r.notices).toEqual(["The microphone was disconnected. What was recorded is saved."]);
  });

  it("the time limit ends the recording", async () => {
    const r = rig({ maxSeconds: 3 });
    await r.session.start();
    r.chunk();
    r.chunk();
    r.chunk();
    await vi.waitFor(() => expect(r.session.active).toBe(false));
    expect(r.notices[0]).toContain("4 hour limit");
    expect(r.log.filter((l) => l === "finish")).toHaveLength(1);
  });

  it("chunks after the stop began, or with nothing recording, are ignored; two stops finish once", async () => {
    const r = rig();
    r.chunk();
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    const a = r.session.stop();
    const b = r.session.stop();
    r.chunk();
    expect(await a).toEqual(await b);
    expect(r.log.filter((l) => l === "finish")).toHaveLength(1);
    expect(r.session.view()).toBeNull();
  });

  it("a recording can be started again after one ended, and a failing store finish is returned", async () => {
    const r = rig({ finish: async () => ({ ok: false, failure: { code: "failed", message: "x" } }) });
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    expect(await r.session.stop()).toMatchObject({ ok: false });
    expect(await r.session.start()).toMatchObject({ ok: true });
  });

  it("a mic that fails to stop does not block saving", async () => {
    const r = rig();
    await r.session.start();
    r.chunk();
    r.chunk();
    await flush();
    expect(await r.session.stop()).toMatchObject({ ok: true });
  });
});
