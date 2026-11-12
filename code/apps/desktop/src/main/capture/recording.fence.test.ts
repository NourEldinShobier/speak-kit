import { describe, expect, it } from "vitest";
import type { RecorderCommand, RecorderResult } from "../../shared/capture/contract";
import { createFence } from "./fence";
import { createSessionPorts, type RecordingDeps } from "./recording";

function setup(startReply: RecorderResult = { ok: true, micOk: true }) {
  const sent: RecorderCommand[] = [];
  const fence = createFence();
  const files = new Map<string, Buffer>();
  const d = {
    platform: { resolve: async () => ({ sourceId: "s1", title: "Screen" }) },
    host: { call: async (c: RecorderCommand) => (sent.push(c), c.op === "start" ? startReply : { ok: true, durationMs: 1000 }) },
    fence,
    bundle: { open: async () => {}, readFile: async () => undefined, frames: async () => [], pcm: async () => undefined },
    settings: () => ({ narration: false }),
    hideOwnWindows: () => {},
    micMissing: () => {},
    now: () => 0,
  } as unknown as RecordingDeps;
  void files;
  return { ports: createSessionPorts(d), fence, sent };
}

describe("recording fence", () => {
  it("opens a generation for the start command and accepts only that one", async () => {
    const { ports, fence, sent } = setup();
    await ports.startRecording("c1", { kind: "screen", displayId: "d" });
    const start = sent[0] as Extract<RecorderCommand, { op: "start" }>;
    expect(start.gen).toBe(1);
    expect(fence.accepts(1)).toBe(true);
    expect(fence.accepts(0)).toBe(false);
  });

  it("closes the fence when the recorder fails to start", async () => {
    const { ports, fence } = setup({ ok: false, code: "source" });
    await expect(ports.startRecording("c1", { kind: "screen", displayId: "d" })).rejects.toThrow("no frames from the source");
    expect(fence.accepts(1)).toBe(false);
  });

  it("closes on abort before the recorder is told, and on stop after its answer", async () => {
    const a = setup();
    await a.ports.startRecording("c1", { kind: "screen", displayId: "d" });
    await a.ports.abortRecording("c1");
    expect(a.fence.accepts(1)).toBe(false);
    const b = setup();
    await b.ports.startRecording("c2", { kind: "screen", displayId: "d" });
    await b.ports.stopRecording("c2");
    expect(b.fence.accepts(1)).toBe(false);
  });
});
