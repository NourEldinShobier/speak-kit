import { describe, expect, it } from "vite-plus/test";
import type { AutomationHost } from "@speakkit/server";
import { lateAutomation } from "./index";

const real = (): AutomationHost & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    status: () => ({ status: "playing", title: "t", index: 0, total: 1, elapsedMs: 0, totalMs: 1, queued: 0 }),
    queue: () => ({ current: null, items: [] }),
    speak: async () => (calls.push("speak"), { id: "a", position: 0, sentences: 1, estimatedMs: 1 }),
    stop: (c) => (calls.push(`stop ${c}`), real().status()),
    startExport: async () => ({ id: "e", stage: "rendering", progress: 0 }),
    exportStatus: (id) => ({ id, stage: "done", progress: 1 }),
    subscribe: () => () => {},
  };
};

describe("lateAutomation", () => {
  it("before the desktop features exist it reports idle and refuses actions as unsupported", async () => {
    const { host } = lateAutomation();
    expect(host.status()).toMatchObject({ status: "idle", queued: 0 });
    expect(host.queue()).toEqual({ current: null, items: [] });
    expect(host.exportStatus("x")).toBeUndefined();
    expect(host.subscribe(() => {})()).toBeUndefined();
    await expect(host.speak({ text: "hi" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(host.startExport({ text: "hi", out: "/a.mp3" })).rejects.toMatchObject({ code: "unsupported" });
    expect(() => host.stop(true)).toThrow();
  });
  it("hands every call to the real host once it is attached", async () => {
    const late = lateAutomation();
    const h = real();
    late.attach(h);
    expect(late.host.status().status).toBe("playing");
    await late.host.speak({ text: "hi" });
    late.host.stop(false);
    expect(h.calls).toEqual(["speak", "stop false"]);
    expect(late.host.exportStatus("e")).toEqual({ id: "e", stage: "done", progress: 1 });
  });
});
