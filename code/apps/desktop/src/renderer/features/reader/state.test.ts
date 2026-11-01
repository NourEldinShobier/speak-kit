import { describe, expect, it } from "vite-plus/test";
import type { DocMeta } from "../../../shared/library/contract";
import { buildDoc } from "./model";
import { initReader, readerReducer, type ReaderAction } from "./state";

const meta = (over: Partial<DocMeta> = {}): DocMeta => ({
  id: "d1",
  title: "T",
  source: "paste",
  format: "text",
  origin: "Pasted text",
  addedAt: 1,
  wordCount: 3,
  progress: { sentence: 0, fraction: 0 },
  finished: false,
  ...over,
});
const doc = buildDoc([{ kind: "paragraph", text: "One. Two." }]);
const run = (...actions: ReaderAction[]) => actions.reduce(readerReducer, initReader(1, "af_heart"));

describe("loading", () => {
  it("starts loading, becomes ready with the reading's own voice, or missing", () => {
    expect(run().load).toEqual({ kind: "loading" });
    const s = run({ type: "loaded", meta: meta({ voice: "bf_emma" }), doc });
    expect(s.load.kind).toBe("ready");
    expect(s.voiceId).toBe("bf_emma");
    expect(run({ type: "loaded", meta: meta(), doc }).voiceId).toBe("af_heart");
    expect(run({ type: "missing" }).load).toEqual({ kind: "missing" });
  });

  it("a refresh after text recognition keeps the chosen voice", () => {
    const s = run({ type: "voice", voiceId: "am_adam" }, { type: "refreshed", meta: meta({ voice: "bf_emma" }), doc });
    expect(s.voiceId).toBe("am_adam");
  });
});

describe("panels and find", () => {
  it("opens a panel, switches to the other, and closes the same one again", () => {
    expect(run({ type: "toggle-panel", panel: "outline" }).panel).toBe("outline");
    expect(run({ type: "toggle-panel", panel: "outline" }, { type: "toggle-panel", panel: "voice" }).panel).toBe("voice");
    expect(run({ type: "toggle-panel", panel: "voice" }, { type: "toggle-panel", panel: "voice" }).panel).toBeNull();
    expect(run({ type: "toggle-panel", panel: "voice" }, { type: "close-panel" }).panel).toBeNull();
  });

  it("find: open, a new query returns to the first match, step, close resets", () => {
    let s = run({ type: "find-open" }, { type: "find-at", current: 4 });
    expect(s.find).toEqual({ open: true, query: "", current: 4 });
    s = readerReducer(s, { type: "find-query", query: "two" });
    expect(s.find).toEqual({ open: true, query: "two", current: 0 });
    expect(readerReducer(s, { type: "find-close" }).find).toEqual({ open: false, query: "", current: 0 });
  });
});

describe("playback helpers", () => {
  it("restart clears the away flag and the dismissed finish card", () => {
    const s = run({ type: "away", away: true }, { type: "restart" });
    expect(s.away).toBe(false);
    expect(s.dismissedFinish).toBe(false);
  });

  it("keeps the same word object when the word did not move", () => {
    const first = { start: 0, end: 3 };
    const s = run({ type: "word", word: first });
    expect(readerReducer(s, { type: "word", word: { start: 0, end: 3 } })).toBe(s);
    expect(readerReducer(s, { type: "word", word: { start: 4, end: 7 } }).word).toEqual({ start: 4, end: 7 });
    expect(readerReducer(s, { type: "word", word: undefined }).word).toBeUndefined();
  });

  it("stores the sleep countdown, the speed and the bookmarks of the open reading", () => {
    const s = run({ type: "loaded", meta: meta(), doc }, { type: "sleep", leftMs: 60_000 }, { type: "speed", speed: 1.5 }, { type: "bookmarks", bookmarks: [{ sentence: 1, text: "Two." } as never] });
    expect(s.sleepLeft).toBe(60_000);
    expect(s.speed).toBe(1.5);
    expect(s.load.kind === "ready" && s.load.meta.bookmarks).toEqual([{ sentence: 1, text: "Two." }]);
    expect(readerReducer(initReader(1, "x"), { type: "bookmarks", bookmarks: [] }).load.kind).toBe("loading");
  });
});
