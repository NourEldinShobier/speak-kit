import { describe, expect, it, vi } from "vite-plus/test";
import type { Clip, Dictation } from "@speakkit/dictation";

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
const { createActions } = await import("./service-actions");

const clip: Clip = { pcm: new Float32Array(1), sampleRate: 16_000, peak: 0.5 };

function rig(over: { clip?: Clip | undefined; status?: "idle" | "error" | "recording" } = {}) {
  const log: string[] = [];
  const failure = {
    clip: "clip" in over ? over.clip : clip,
    error: "model-failed",
    replay: { replay: () => log.push("replay") } as never,
    last: { code: "model-failed", at: 1 } as { code: string; at: number } | undefined,
  };
  const core = { start: () => log.push("start"), stop: () => log.push("stop"), cancel: () => log.push("cancel") } as unknown as Dictation;
  const actions = createActions({
    ready: async () => undefined,
    failure,
    core: () => core,
    state: () => ({ status: over.status ?? "error", code: "model-failed" }) as never,
    presenter: { dismiss: () => log.push("hud-dismiss") } as never,
    download: () => log.push("download"),
    undoCancel: async () => true,
    copyLast: async () => undefined,
    pasteAgain: async () => undefined,
    changed: () => log.push("changed"),
  });
  return { actions, failure, log };
}

describe("answering the last failure", () => {
  it("Try again runs the kept take again and clears the failure from the page", async () => {
    const r = rig();
    await r.actions.retry();
    expect(r.failure.last).toBeUndefined();
    expect(r.failure.clip).toBeUndefined();
    expect(r.log).toEqual(["changed", "replay", "start"]);
  });

  it("Try again does nothing without a kept take, while recording, and keeps the failure", async () => {
    const none = rig({ clip: undefined });
    await none.actions.retry();
    const busy = rig({ status: "recording" });
    await busy.actions.retry();
    expect(none.failure.last).toBeDefined();
    expect(busy.failure.last).toBeDefined();
    expect(none.log).toEqual([]);
    expect(busy.log).toEqual([]);
  });

  it("Dismiss clears the failure from the page and the HUD", () => {
    const r = rig();
    r.actions.hudAction("dismiss");
    expect(r.failure.last).toBeUndefined();
    expect(r.log).toEqual(["hud-dismiss", "changed"]);
  });

  it("other buttons leave the failure alone", () => {
    const r = rig();
    r.actions.hudAction("download");
    expect(r.failure.last).toBeDefined();
  });

  it("Dismiss with nothing to clear does not announce a change", () => {
    const r = rig();
    r.failure.last = undefined;
    r.actions.hudAction("dismiss");
    expect(r.log).toEqual(["hud-dismiss"]);
  });
});
