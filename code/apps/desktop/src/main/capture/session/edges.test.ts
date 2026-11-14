import { describe, expect, it } from "vitest";
import type { Notice } from "../../../shared/capture/notices";
import { createSession, type Media, type SessionPorts, type SessionState, type Target } from "./index";

const screen: Target = { kind: "screen", displayId: "1" };
const media = (extra: Partial<Media> = {}): Media => ({ durationMs: 4000, frames: [{ atMs: 0, file: "f0.jpg" }], videoFile: "video.webm", pcm: new Int16Array(10), ...extra });

function setup(over: Partial<SessionPorts> = {}) {
  const calls: string[] = [];
  const notices: Notice[] = [];
  const logs: string[] = [];
  const states: SessionState[] = [];
  let n = 0;
  const ports: SessionPorts = {
    newId: () => `c${++n}`,
    now: () => 1000,
    pick: async () => screen,
    startRecording: async (id) => void calls.push(`start ${id}`),
    switchTarget: async (id) => void calls.push(`switch ${id}`),
    stopRecording: async () => media(),
    abortRecording: async (id) => void calls.push(`abort ${id}`),
    transcribe: async () => [{ text: "hi", startMs: 0, endMs: 10 }],
    save: async (id) => ({ id }) as never,
    discard: async (id) => void calls.push(`discard ${id}`),
    journal: { begin: async () => {}, stage: async (_id, s, m) => void calls.push(`stage ${s} ${m ?? ""}`.trim()) },
    notify: (x) => notices.push(x),
    changed: (s) => void states.push(s),
    log: (l) => logs.push(l),
    ...over,
  };
  return { session: createSession(ports), calls, notices, logs, states };
}

describe("session edges", () => {
  it("walks the finishing steps in order: video, words, saving", async () => {
    const { session, states } = setup();
    await session.start();
    session.stop();
    await session.idle();
    expect(states.filter((s) => s.phase === "finishing").map((s) => s.step)).toEqual(["video", "words", "saving"]);
    expect(states.at(-1)).toEqual({ phase: "idle" });
  });
  it("tells the observer about every change, starting with the picker", async () => {
    const { session, states } = setup();
    await session.start();
    expect(states.map((s) => s.phase)).toEqual(["picking", "picking", "recording"]);
    expect(states.at(-1)).toMatchObject({ phase: "recording", segments: 1, startedAt: 1000, target: screen });
  });
  it("writes the first picture to the journal when there is no video", async () => {
    const { session, calls } = setup({ stopRecording: async () => media({ videoFile: undefined }) });
    await session.start();
    session.stop();
    await session.idle();
    expect(calls).toContain("stage media-saved f0.jpg");
  });
  it("keeps a capture that has a video but no pictures", async () => {
    const { session, calls, notices } = setup({ stopRecording: async () => media({ frames: [] }) });
    await session.start();
    session.stop();
    await session.idle();
    expect(calls).toContain("stage media-saved video.webm");
    expect(notices).toEqual([]);
  });
  it("keeps a capture that has pictures but no video", async () => {
    const { session, notices } = setup({ stopRecording: async () => media({ videoFile: undefined }) });
    await session.start();
    session.stop();
    await session.idle();
    expect(notices).toEqual([]);
  });
  it("logs why a capture failed with the capture's id, and says it on screen", async () => {
    const { session, logs, notices } = setup({
      stopRecording: async () => {
        throw new Error("encoder failed");
      },
    });
    await session.start();
    session.stop();
    await session.idle();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^capture c1 failed: /);
    expect(logs[0]).toContain("encoder failed");
    expect(notices).toHaveLength(1);
    expect(session.state.phase).toBe("idle");
  });
  it("logs a failed step that must not break the capture, and goes on", async () => {
    const { session, logs, notices, calls } = setup({
      transcribe: async () => {
        throw new Error("model gone");
      },
    });
    await session.start();
    session.stop();
    await session.idle();
    expect(logs).toEqual(["capture words of c1: model gone"]);
    expect(notices.map((n) => n.code)).toEqual(["no-words"]);
    expect(calls).toContain("stage complete");
  });
  it("logs a picker that throws", async () => {
    const { session, logs } = setup({
      pick: async () => {
        throw new Error("window closed");
      },
    });
    await session.start();
    expect(logs).toEqual(["capture picker: window closed"]);
  });
  it("does nothing when stopped, discarded or switched while not recording", async () => {
    const { session, calls, states } = setup();
    session.stop();
    session.discard();
    expect(await session.switchTarget(screen)).toBe(false);
    expect(calls).toEqual([]);
    expect(states).toEqual([]);
  });
  it("does not discard a capture that is being saved", async () => {
    const { session, calls } = setup();
    await session.start();
    session.stop();
    session.discard();
    await session.idle();
    expect(calls).not.toContain("abort c1");
    expect(calls).toContain("stage complete");
  });
  it("starts a new segment on a switch and counts it", async () => {
    const { session, calls } = setup();
    await session.start();
    expect(await session.switchTarget({ kind: "screen", displayId: "2" })).toBe(true);
    expect(session.state).toMatchObject({ phase: "recording", segments: 2, target: { displayId: "2" } });
    expect(calls).toContain("switch c1");
  });
  it("reports a failed switch and keeps recording", async () => {
    const { session, notices, logs } = setup({
      switchTarget: async () => {
        throw new Error("source gone");
      },
    });
    await session.start();
    expect(await session.switchTarget({ kind: "screen", displayId: "2" })).toBe(false);
    expect(session.state).toMatchObject({ phase: "recording", segments: 1 });
    expect(notices).toHaveLength(1);
    expect(logs[0]).toContain("source gone");
  });
  it("does not start while another capture is being saved, and says so", async () => {
    const { session, notices } = setup();
    await session.start();
    session.stop();
    expect(await session.start()).toEqual({ ok: false, reason: "finishing" });
    expect(notices.map((n) => n.code)).toEqual(["still-saving"]);
    await session.idle();
  });
  it("throws away the folder when the recorder fails to start", async () => {
    const { session, calls } = setup({
      startRecording: async () => {
        throw new Error("no frames from the source");
      },
    });
    expect(await session.start()).toEqual({ ok: false, reason: "failed" });
    expect(calls).toEqual(["abort c1", "discard c1"]);
    expect(session.state).toEqual({ phase: "idle" });
  });
});
