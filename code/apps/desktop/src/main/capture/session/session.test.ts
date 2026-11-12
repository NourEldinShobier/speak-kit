import { describe, expect, it } from "vitest";
import type { Notice } from "../../../shared/capture/notices";
import type { Frame } from "../keyframes";
import type { Word } from "../narration";
import { createSession, type Media, type SessionPorts, type Target } from "./index";

const screen: Target = { kind: "screen", displayId: "1" };
const frame = (atMs: number): Frame => ({ atMs, file: `f${atMs}.jpg` });
const media = (extra: Partial<Media> = {}): Media => ({ durationMs: 4000, frames: [frame(0), frame(1000)], videoFile: "video.webm", pcm: new Int16Array(10), ...extra });
const words: Word[] = [{ text: "hi", startMs: 0, endMs: 10 }];

function setup(over: Partial<SessionPorts> = {}) {
  const calls: string[] = [];
  const notices: Notice[] = [];
  let n = 0;
  const ports: SessionPorts = {
    newId: () => `c${++n}`,
    now: () => 1000,
    pick: async () => screen,
    startRecording: async (id) => void calls.push(`start ${id}`),
    switchTarget: async (id) => void calls.push(`switch ${id}`),
    stopRecording: async (id) => (calls.push(`stop ${id}`), media()),
    abortRecording: async (id) => void calls.push(`abort ${id}`),
    transcribe: async () => (calls.push("transcribe"), words),
    save: async (id) => (calls.push(`save ${id}`), { id } as never),
    discard: async (id) => void calls.push(`discard ${id}`),
    journal: { begin: async (id) => void calls.push(`begin ${id}`), stage: async (_id, s) => void calls.push(`stage ${s}`) },
    notify: (x) => notices.push(x),
    changed: () => {},
    log: () => {},
    ...over,
  };
  return { session: createSession(ports), calls, notices };
}

describe("capture session", () => {
  it("picks, records, then finishes in order: video, words, save, with the journal before each step", async () => {
    const { session, calls } = setup();
    expect(await session.start()).toEqual({ ok: true });
    expect(session.state.phase).toBe("recording");
    session.stop();
    expect(session.state.phase).toBe("finishing");
    await session.idle();
    expect(calls).toEqual(["begin c1", "start c1", "stop c1", "stage media-saved", "transcribe", "stage words-saved", "save c1", "stage complete"]);
    expect(session.state).toEqual({ phase: "idle" });
  });
  it("a cancelled picker ends the capture, says so, and leaves the app idle", async () => {
    const { session, calls, notices } = setup({ pick: async () => null });
    expect(await session.start()).toEqual({ ok: false, reason: "cancelled" });
    expect(session.state.phase).toBe("idle");
    expect(calls).toEqual([]);
    expect(notices.map((x) => x.code)).toEqual(["cancelled"]);
  });
  it("a picker that throws is a cancel", async () => {
    const { session } = setup({
      pick: async () => {
        throw new Error("window closed");
      },
    });
    expect((await session.start()).ok).toBe(false);
    expect(session.state.phase).toBe("idle");
  });
  it("only one capture at a time: a second start is refused, and says why while the last one is being saved", async () => {
    const { session, notices } = setup();
    await session.start();
    expect(await session.start()).toEqual({ ok: false, reason: "busy" });
    session.stop();
    expect(await session.start()).toEqual({ ok: false, reason: "finishing" });
    expect(notices.map((x) => x.code)).toEqual(["still-saving"]);
    await session.idle();
    expect(await session.start()).toEqual({ ok: true });
  });
  it("a start while the picker is open is refused", async () => {
    let release!: (t: Target | null) => void;
    const { session } = setup({ pick: () => new Promise((r) => (release = r)) });
    const first = session.start();
    expect(session.state.phase).toBe("picking");
    expect(await session.start()).toEqual({ ok: false, reason: "busy" });
    release(screen);
    expect(await first).toEqual({ ok: true });
  });
  it("discard during the picker returns to idle at once and the late pick result is ignored", async () => {
    let release!: (t: Target | null) => void;
    const { session, calls } = setup({ pick: () => new Promise((r) => (release = r)) });
    const first = session.start();
    session.discard();
    expect(session.state.phase).toBe("idle");
    release(screen);
    expect(await first).toEqual({ ok: false, reason: "cancelled" });
    expect(calls).toEqual([]);
  });
  it("discard while recording stops the recorder, removes the folder and returns to idle at once", async () => {
    const { session, calls } = setup();
    await session.start();
    session.discard();
    expect(session.state.phase).toBe("idle");
    await session.idle();
    expect(calls.slice(-2)).toEqual(["abort c1", "discard c1"]);
    expect(calls).not.toContain("save c1");
  });
  it("discard while the recorder is still starting throws the recording away when it comes up", async () => {
    let up!: () => void;
    const { session, calls } = setup({ startRecording: () => new Promise<void>((r) => (up = r)) });
    const started = session.start(screen);
    await Promise.resolve();
    await Promise.resolve();
    session.discard();
    up();
    expect(await started).toEqual({ ok: false, reason: "cancelled" });
    expect(calls).toContain("abort c1");
    expect(calls).toContain("discard c1");
    expect(session.state.phase).toBe("idle");
  });
  it("discard while idle or finishing does nothing", async () => {
    const { session } = setup();
    session.discard();
    await session.start();
    session.stop();
    session.discard();
    expect(session.state.phase).toBe("finishing");
    await session.idle();
  });
  it("a recording with no frames fails loudly and is not saved", async () => {
    const { session, calls, notices } = setup({ stopRecording: async () => media({ frames: [], videoFile: undefined }) });
    await session.start();
    session.stop();
    await session.idle();
    expect(notices.map((x) => x.code)).toEqual(["nothing-recorded"]);
    expect(calls).not.toContain("save c1");
    expect(calls).toContain("discard c1");
    expect(session.state.phase).toBe("idle");
  });
  it("a recorder that cannot start reports it, cleans up and is idle", async () => {
    const { session, calls, notices } = setup({
      startRecording: async () => {
        throw new Error("NotAllowedError: Permission denied");
      },
    });
    expect(await session.start()).toEqual({ ok: false, reason: "failed" });
    expect(notices.map((x) => x.code)).toEqual(["permission-denied"]);
    expect(calls).toContain("discard c1");
    expect(session.state.phase).toBe("idle");
  });
  it("never shows a raw error text", async () => {
    const { session, notices } = setup({
      stopRecording: async () => {
        throw new Error("ECONNRESET at socket.js:12");
      },
    });
    await session.start();
    session.stop();
    await session.idle();
    expect(JSON.stringify(notices)).not.toContain("ECONNRESET");
    expect(notices[0]!.code).toBe("failed");
  });
  it("keeps the capture and tells the person when no words could be made", async () => {
    const { session, calls, notices } = setup({ transcribe: async () => null });
    await session.start();
    session.stop();
    await session.idle();
    expect(notices.map((x) => x.code)).toEqual(["no-words"]);
    expect(calls).toContain("save c1");
  });
  it("a transcriber that throws still saves the capture", async () => {
    const { session, calls } = setup({
      transcribe: async () => {
        throw new Error("model gone");
      },
    });
    await session.start();
    session.stop();
    await session.idle();
    expect(calls).toContain("save c1");
  });
  it("does not complain about words when there was no microphone track", async () => {
    const { session, notices } = setup({ stopRecording: async () => media({ pcm: undefined }), transcribe: async () => null });
    await session.start();
    session.stop();
    await session.idle();
    expect(notices).toEqual([]);
  });
  it("tells the person when the encoder fell back to the processor", async () => {
    const { session, notices } = setup({ stopRecording: async () => media({ softwareEncoder: true }) });
    await session.start();
    session.stop();
    await session.idle();
    expect(notices.map((x) => x.code)).toEqual(["software-encoder"]);
  });
  it("a failure in the last step leaves the journal short of complete so it can be picked up again", async () => {
    const { session, calls } = setup({
      save: async () => {
        throw new Error("ENOSPC");
      },
    });
    await session.start();
    session.stop();
    await session.idle();
    expect(calls).not.toContain("stage complete");
    expect(calls).toContain("stage words-saved");
    expect(session.state.phase).toBe("idle");
  });
  it("a target switch starts a new segment and recording continues", async () => {
    const { session, calls } = setup();
    await session.start();
    expect(await session.switchTarget({ kind: "window", windowId: "w", title: "W" })).toBe(true);
    expect(session.state.segments).toBe(2);
    expect(session.state.phase).toBe("recording");
    expect(calls).toContain("switch c1");
  });
  it("a target switch outside a recording does nothing", async () => {
    const { session, calls } = setup();
    expect(await session.switchTarget(screen)).toBe(false);
    expect(calls).toEqual([]);
  });
  it("stop outside a recording does nothing", () => {
    const { session } = setup();
    session.stop();
    expect(session.state.phase).toBe("idle");
  });
  it("a saved choice skips the picker", async () => {
    let picked = 0;
    const { session } = setup({ pick: async () => (picked++, screen) });
    await session.start(screen);
    expect(picked).toBe(0);
  });
});
