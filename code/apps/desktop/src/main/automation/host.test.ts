import { describe, expect, it } from "vite-plus/test";
import type { AutomationStatus } from "@speakkit/protocol";
import { AutomationFault } from "@speakkit/server";
import type { ExportView } from "../../shared/export";
import { IDLE_READER, splitSentences, type ReaderState } from "../../shared/reader";
import { createAutomationHost, type HostDeps } from "./host";

/** A reader that behaves like the real one at its edges: start emits preparing, stop emits idle, text without words fails. */
function setup(over: Partial<HostDeps> = {}) {
  let state: ReaderState = IDLE_READER;
  const started: string[] = [];
  let dictating = false;
  let engine: string | undefined = "ready";
  let n = 0;
  const exports: ExportView[] = [];
  const a = createAutomationHost({
    reader: {
      state: () => state,
      start: (text) => {
        const parts = splitSentences(text);
        if (!parts.length) return false;
        started.push(text);
        set({ ...IDLE_READER, status: "preparing", title: text.slice(0, 20), total: parts.length });
        return true;
      },
      stop: () => set(IDLE_READER),
    },
    split: splitSentences,
    estimateMs: (s) => s.length * 10,
    engineState: () => engine,
    dictating: () => dictating,
    exporter: {
      start: async (o) => {
        const v: ExportView = { id: `x${exports.length + 1}`, name: `${o.name}.${o.format}`, stage: "rendering", progress: 0, done: 0, total: 1 };
        exports.push(v);
        return v;
      },
      view: (id) => exports.find((e) => e.id === id),
    },
    now: () => 1000,
    newId: () => `id${++n}`,
    ...over,
  });
  const set = (s: ReaderState) => {
    state = s;
    a.onReader(s);
  };
  const seen: AutomationStatus[] = [];
  a.host.subscribe((s) => seen.push(s));
  return {
    a,
    host: a.host,
    started,
    seen,
    exports,
    set,
    play: () => set({ ...state, status: "playing" }),
    finish: () => set({ ...state, status: "finished" }),
    setDictating: (b: boolean) => (dictating = b),
    setEngine: (e: string | undefined) => (engine = e),
  };
}

const fault = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e instanceof AutomationFault ? e.code : e;
  }
  return null;
};

describe("speak", () => {
  it("starts reading at once when nothing is playing", async () => {
    const t = setup();
    expect(await t.host.speak({ text: "Hello there. How are you?" })).toEqual({ id: "id1", position: 0, sentences: 2, estimatedMs: 240 });
    expect(t.started).toEqual(["Hello there. How are you?"]);
  });
  it("replaces the current reading by default", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second." });
    expect(t.started).toEqual(["First.", "Second."]);
    expect(t.host.queue().items).toEqual([]);
  });
  it("queues behind a playing reading and reports the place", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    expect((await t.host.speak({ text: "Second.", mode: "queue" })).position).toBe(1);
    expect((await t.host.speak({ text: "Third.", mode: "queue" })).position).toBe(2);
    expect(t.host.queue()).toEqual({
      current: { title: "First.", status: "playing", index: 0, total: 1 },
      items: [
        { id: "id2", title: "Second.", chars: 7, addedAtMs: 1000 },
        { id: "id3", title: "Third.", chars: 6, addedAtMs: 1000 },
      ],
    });
    expect(t.host.status().queued).toBe(2);
  });
  it("starts a queued request at once when the reader is free", async () => {
    const t = setup();
    expect(await t.host.speak({ text: "Now.", mode: "queue" })).toMatchObject({ position: 0 });
    expect(t.started).toEqual(["Now."]);
  });
  it("reads the next waiting item when one finishes, in order", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    await t.host.speak({ text: "Third.", mode: "queue" });
    t.finish();
    expect(t.started).toEqual(["First.", "Second."]);
    t.play();
    t.finish();
    expect(t.started).toEqual(["First.", "Second.", "Third."]);
    expect(t.host.queue().items).toEqual([]);
  });
  it("moves on when a reading fails", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    t.set({ ...IDLE_READER, status: "error", title: "Speak Kit" });
    expect(t.started).toEqual(["First.", "Second."]);
  });
  it("refuses a 21st waiting reading with queue_full and keeps the 20", async () => {
    const t = setup();
    await t.host.speak({ text: "Playing." });
    t.play();
    for (let i = 0; i < 20; i++) await t.host.speak({ text: `Item ${i}.`, mode: "queue" });
    expect(await fault(t.host.speak({ text: "One more.", mode: "queue" }))).toBe("queue_full");
    expect(t.host.queue().items).toHaveLength(20);
  });
  it.each([[""], ["   "], ["...!!!"]])("refuses text with nothing to say (%j) as invalid_input", async (text) => {
    const t = setup();
    expect(await fault(t.host.speak({ text }))).toBe("invalid_input");
    expect(t.started).toEqual([]);
  });
  it("refuses while the model is missing or downloading", async () => {
    const t = setup();
    t.setEngine("missing");
    expect(await fault(t.host.speak({ text: "Hi." }))).toBe("model_missing");
    t.setEngine("downloading");
    expect(await fault(t.host.speak({ text: "Hi." }))).toBe("model_missing");
    t.setEngine("unloaded");
    expect(await fault(t.host.speak({ text: "Hi." }))).toBeNull();
  });
  it("refuses while dictation is recording", async () => {
    const t = setup();
    t.setDictating(true);
    expect(await fault(t.host.speak({ text: "Hi." }))).toBe("busy");
    expect(t.started).toEqual([]);
  });
  it("a dry run returns the parts and the estimate and touches nothing, even with the model missing", async () => {
    const t = setup();
    t.setEngine("missing");
    t.setDictating(true);
    expect(await t.host.speak({ text: "One. Two!", dryRun: true })).toEqual({ id: "", position: 0, sentences: 2, estimatedMs: 80, parts: ["One.", "Two!"] });
    expect(t.started).toEqual([]);
    expect(t.host.queue().items).toEqual([]);
  });
  it("gives every request its own id when called at the same moment", async () => {
    const t = setup();
    const ids = await Promise.all(["A.", "B.", "C."].map((text) => t.host.speak({ text, mode: "queue" }).then((r) => r.id)));
    expect(new Set(ids).size).toBe(3);
  });
});

describe("stop", () => {
  it("stops the reading and empties the list by default for a person's stop", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    expect(t.host.stop(true).status).toBe("idle");
    expect(t.host.queue()).toEqual({ current: null, items: [] });
  });
  it("without clear it skips to the next waiting item", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    await t.host.speak({ text: "Third.", mode: "queue" });
    expect(t.host.stop(false)).toMatchObject({ status: "preparing", title: "Second.", queued: 1 });
  });
  it("the person pressing stop in the app also empties the list", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    t.set(IDLE_READER); // what the mini player's stop button does
    expect(t.host.queue().items).toEqual([]);
    expect(t.started).toEqual(["First."]);
  });
  it("is harmless when nothing is playing, and when called twice", () => {
    const t = setup();
    expect(t.host.stop(true).status).toBe("idle");
    expect(t.host.stop(true).status).toBe("idle");
    expect(t.host.stop(false).status).toBe("idle");
  });
});

describe("status stream", () => {
  it("tells subscribers about each change and stops after unsubscribe", async () => {
    const t = setup();
    const own: string[] = [];
    const off = t.host.subscribe((s) => own.push(s.status));
    await t.host.speak({ text: "Hi." });
    t.play();
    off();
    t.finish();
    expect(own).toEqual(["preparing", "playing"]);
  });
  it("counts the waiting list in the status it sends", async () => {
    const t = setup();
    await t.host.speak({ text: "First." });
    t.play();
    await t.host.speak({ text: "Second.", mode: "queue" });
    expect(t.seen.at(-1)?.queued).toBe(1);
  });
});

describe("export", () => {
  it("starts an mp3 from an absolute path and reports it", async () => {
    const t = setup();
    const r = await t.host.startExport({ text: "Hello.", out: "/tmp/notes.mp3" });
    expect(r).toEqual({ id: "x1", stage: "rendering", progress: 0 });
    expect(t.host.exportStatus("x1")).toEqual(r);
    expect(t.host.exportStatus("nope")).toBeUndefined();
  });
  it.each([["/tmp/notes.txt"], ["/tmp/notes"], ["relative/notes.mp3"]])("refuses the path %s", async (out) => {
    const t = setup();
    expect(await fault(t.host.startExport({ text: "Hello.", out }))).toBe("invalid_input");
    expect(t.exports).toEqual([]);
  });
  it("refuses text with nothing to say and a missing model", async () => {
    const t = setup();
    expect(await fault(t.host.startExport({ text: "!!!", out: "/tmp/a.wav" }))).toBe("invalid_input");
    t.setEngine("missing");
    expect(await fault(t.host.startExport({ text: "Hello.", out: "/tmp/a.wav" }))).toBe("model_missing");
  });
  it("reports the path and an error code of a finished or failed job", () => {
    const t = setup();
    t.exports.push({ id: "x9", name: "a.mp3", stage: "done", progress: 1, done: 1, total: 1, path: "/tmp/a.mp3" });
    t.exports.push({ id: "x10", name: "b.mp3", stage: "error", progress: 0.5, done: 0, total: 1, error: { code: "disk-full" } as never });
    expect(t.host.exportStatus("x9")).toEqual({ id: "x9", stage: "done", progress: 1, path: "/tmp/a.mp3" });
    expect(t.host.exportStatus("x10")).toEqual({ id: "x10", stage: "error", progress: 0.5, error: "disk-full" });
  });
});
