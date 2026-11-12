import { describe, expect, it } from "vite-plus/test";
import { historyStats, planEviction, timeLeft, type Term } from "../src";
import { createHistory, type AudioTrash, type NewEntry } from "../src/history";
import { fakeClock, fakeStorage, loud, rig } from "./fakes";

const DAY = 86_400_000;
const entry = (at: number, text = "hello", extra: Partial<NewEntry> = {}): NewEntry => ({ at, text, raw: text, durationMs: 1000, ...extra });
const term = (word: string, soundsLike: string[]): Term => ({ id: word, word, soundsLike });

function setup(opts: { audio?: AudioTrash; terms?: Term[]; stored?: unknown } = {}) {
  const time = fakeClock(100 * DAY);
  const store = fakeStorage(opts.stored);
  const history = createHistory({ storage: store.storage, clock: time.clock, retention: () => "7d", ...(opts.audio && { audio: opts.audio }), terms: () => opts.terms ?? [] });
  return { history, time, store };
}

describe("retention on each entry", () => {
  it("counts the time left to the exact millisecond and never below zero", () => {
    expect(timeLeft({ at: 0 }, 6 * DAY, "7d")).toBe(DAY);
    expect(timeLeft({ at: 0 }, 7 * DAY, "7d")).toBe(0);
    expect(timeLeft({ at: 0 }, 8 * DAY, "7d")).toBe(0);
    expect(timeLeft({ at: 0 }, 99 * DAY, "forever")).toBe(Infinity);
    expect(timeLeft({ at: 5 * DAY }, 5 * DAY + 1000, "24h")).toBe(DAY - 1000);
  });
});

describe("recordings and the Recycle Bin", () => {
  it("moves the recording to the bin when its entry is removed", async () => {
    const moved: string[] = [];
    const { history, time } = setup({ audio: { trash: async (f) => (moved.push(f), true) } });
    const id = await history.add(entry(time.clock.now(), "a", { audio: "a.wav" }));
    expect(await history.remove(id!)).toEqual({ kept: [] });
    expect(moved).toEqual(["a.wav"]);
  });

  it("removes the entry but keeps the file and reports it when the bin fails, whether it returns false or throws", async () => {
    for (const fail of [async () => false, async () => Promise.reject(new Error("locked"))]) {
      const { history, time } = setup({ audio: { trash: fail } });
      const id = await history.add(entry(time.clock.now(), "a", { audio: "a.wav" }));
      expect(await history.remove(id!)).toEqual({ kept: ["a.wav"] });
      expect(await history.list()).toEqual([]);
    }
  });

  it("reports every recording that stayed when everything is cleared, and when old entries expire", async () => {
    const { history, time } = setup({ audio: { trash: async (f) => f !== "b.wav" } });
    await history.add(entry(time.clock.now(), "a", { audio: "a.wav" }));
    await history.add(entry(time.clock.now() - 1, "b", { audio: "b.wav" }));
    await history.add(entry(time.clock.now() - 2, "no audio"));
    expect(await history.clear()).toEqual({ kept: ["b.wav"] });
    await history.add(entry(time.clock.now() - 8 * DAY, "old", { audio: "b.wav" }));
    await history.add(entry(time.clock.now(), "new"));
    expect((await history.prune()).kept).toEqual([]);
  });

  it("forgets recordings deleted from disk and keeps the text", async () => {
    const { history, time } = setup();
    const id = await history.add(entry(time.clock.now(), "kept text", { audio: "a.wav" }));
    await history.dropAudio(["other.wav"]);
    expect((await history.get(id!))?.audio).toBe("a.wav");
    await history.dropAudio(["a.wav"]);
    expect(await history.get(id!)).toMatchObject({ text: "kept text", audioRemoved: true });
    expect(await history.get(id!)).not.toHaveProperty("audio");
  });

  it("picks the oldest recordings to delete until the folder fits", () => {
    const files = [
      { file: "new", bytes: 100, at: 3 },
      { file: "old", bytes: 100, at: 1 },
      { file: "mid", bytes: 100, at: 2 },
    ];
    expect(planEviction(files, 300, 0)).toEqual([]);
    expect(planEviction(files, 300, 1)).toEqual(["old"]);
    expect(planEviction(files, 250, 100)).toEqual(["old", "mid"]);
    expect(planEviction(files, 0, 0)).toEqual(["old", "mid", "new"]);
    expect(planEviction([], 10, 5)).toEqual([]);
  });
});

describe("versions", () => {
  it("keeps the first version, adds another and switches the text in use", async () => {
    const { history, time } = setup();
    const id = (await history.add(entry(time.clock.now(), "Hello wurld", { model: "large" })))!;
    const v2 = await history.addVersion(id, { model: "parakeet", at: time.clock.now(), text: "Hello world", ms: 900 });
    const e = await history.get(id);
    expect(e?.versions?.map((v) => [v.id, v.model, v.text])).toEqual([
      ["v1", "large", "Hello wurld"],
      ["v2", "parakeet", "Hello world"],
    ]);
    expect(e?.text).toBe("Hello wurld");
    expect(await history.useVersion(id, v2!)).toBe(true);
    expect(await history.get(id)).toMatchObject({ text: "Hello world", version: "v2" });
    expect(await history.useVersion(id, "v1")).toBe(true);
    expect((await history.get(id))?.text).toBe("Hello wurld");
  });

  it("refuses an unknown entry or version", async () => {
    const { history, time } = setup();
    const id = (await history.add(entry(time.clock.now())))!;
    expect(await history.addVersion("nope", { model: "m", at: 1, text: "t", ms: 1 })).toBeUndefined();
    expect(await history.useVersion(id, "v9")).toBe(false);
    expect(await history.useVersion("nope", "v1")).toBe(false);
  });

  it("numbers versions in order even when added at once", async () => {
    const { history, time } = setup();
    const id = (await history.add(entry(time.clock.now(), "a", { model: "m" })))!;
    const ids = [await history.addVersion(id, { model: "x", at: 1, text: "b", ms: 1 }), await history.addVersion(id, { model: "y", at: 2, text: "c", ms: 1 })];
    expect(ids).toEqual(["v2", "v3"]);
  });
});

describe("search by sounds-like spelling", () => {
  const terms = [term("Kubernetes", ["cooper netties", "kuber nettys"])];

  it("finds the entry with the word and says which vocabulary entry matched", async () => {
    const { history, time } = setup({ terms });
    await history.add(entry(time.clock.now(), "Deploy Kubernetes today"));
    await history.add(entry(time.clock.now() - 1, "Nothing here"));
    const hits = await history.list({ search: "cooper netties" });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ text: "Deploy Kubernetes today", via: { word: "Kubernetes", heard: "cooper netties" } });
  });

  it("does not mark a plain text hit as an alias hit, and finds nothing for an unknown spelling", async () => {
    const { history, time } = setup({ terms });
    await history.add(entry(time.clock.now(), "Deploy Kubernetes today"));
    expect((await history.list({ search: "kubernetes" }))[0]).not.toHaveProperty("via");
    expect(await history.list({ search: "zzz" })).toEqual([]);
  });
});

describe("files from another version", () => {
  it("opens a file saved by a newer app empty, keeps a copy and never overwrites it", async () => {
    const newer = { version: 99, entries: [{ id: "x", at: 1, text: "t", raw: "t", durationMs: 1 }] };
    const { history, store, time } = setup({ stored: newer });
    expect(await history.list()).toEqual([]);
    expect(history.status()).toBe("newer");
    expect(store.state.preserved).toEqual(["newer"]);
    await history.add(entry(time.clock.now(), "new text"));
    await history.clear();
    expect(store.state.saves).toBe(0);
  });

  it("reports a file that is not a history as unreadable with the name of the kept copy, and keeps working", async () => {
    for (const junk of [null, 5, "text", { version: 1 }, { entries: "x" }]) {
      const { history, store, time } = setup({ stored: junk });
      expect(await history.list()).toEqual([]);
      expect(history.status()).toBe("unreadable");
      expect(history.preservedAs()).toBe("history.unreadable-1.json");
      expect(store.state.preserved).toEqual(["unreadable"]);
      await history.add(entry(time.clock.now(), "fresh"));
      expect(store.state.saves).toBe(1);
    }
  });

  it("reports storage that throws on load as unreadable, and a failing copy leaves the notice without a name", async () => {
    const { history, store } = setup();
    store.state.failLoad = true;
    store.storage.preserve = async () => Promise.reject(new Error("disk full"));
    expect(await history.list()).toEqual([]);
    expect(history.status()).toBe("unreadable");
    expect(history.preservedAs()).toBeUndefined();
  });

  it("names the copy of a newer file", async () => {
    const { history } = setup({ stored: { version: 99, entries: [] } });
    await history.list();
    expect(history.preservedAs()).toBe("history.newer-1.json");
  });

  it("loads the first format (a bare list) and writes the versioned one", async () => {
    const { history, store, time } = setup({ stored: [{ id: "a", at: 100 * DAY - 1000, text: "old", raw: "old", durationMs: 5 }] });
    expect((await history.list()).map((e) => e.text)).toEqual(["old"]);
    expect(history.status()).toBe("ok");
    await history.add(entry(time.clock.now(), "b"));
    expect((store.state.raw as { version: number }).version).toBe(1);
  });

  it("treats a file of the wrong shape as an empty history", async () => {
    for (const stored of ["text", 5, { version: 1, entries: "no" }, null]) expect(await setup({ stored }).history.list()).toEqual([]);
  });
});

describe("numbers above the list", () => {
  it("counts dictations, words, words per minute and listening time", () => {
    expect(
      historyStats([
        { text: "one two three", durationMs: 30_000 },
        { text: "four five", durationMs: 30_000 },
        { text: "", durationMs: 0 },
      ]),
    ).toEqual({ dictations: 3, words: 5, listeningMs: 60_000, wordsPerMinute: 5 });
    expect(historyStats([])).toEqual({ dictations: 0, words: 0, listeningMs: 0, wordsPerMinute: 0 });
  });
});

describe("through the dictation", () => {
  it("keeps the recording when asked and an audio store exists, linking it to the entry", async () => {
    const saved: string[] = [];
    const audio = { save: async (id: string) => (saved.push(id), `${id}.wav`), load: async () => loud(), trash: async () => true };
    const r = await rig({ keepRecordings: true }, undefined, { audio });
    await r.hold(1000);
    await r.time.advance(200);
    const [e] = await r.dictation.history.list();
    expect(e?.audio).toBe(`${e?.id}.wav`);
    expect(saved).toEqual([e?.id]);
    expect((await r.dictation.history.audio(e!.id))?.peak).toBe(0.5);
  });

  it("keeps nothing without the setting, and still inserts when the store fails", async () => {
    const audio = { save: async () => Promise.reject(new Error("disk")), load: async () => undefined, trash: async () => true };
    const off = await rig({}, undefined, { audio: { ...audio, save: async () => "x.wav" } });
    await off.hold(1000);
    await off.time.advance(200);
    expect((await off.dictation.history.list())[0]).not.toHaveProperty("audio");
    const broken = await rig({ keepRecordings: true }, undefined, { audio });
    await broken.hold(1000);
    await broken.time.advance(200);
    expect(broken.ins.inserted).toHaveLength(1);
    expect((await broken.dictation.history.list())[0]).not.toHaveProperty("audio");
  });

  it("lists the last texts for Copy recent, newest first", async () => {
    const r = await rig();
    for (const text of ["one", "two", "three"]) {
      r.stt.state.result = { ok: true, text };
      await r.hold(1000);
      await r.time.advance(200);
    }
    expect((await r.dictation.history.recent(2)).map((e) => e.text)).toEqual(["Three ", "Two "]);
    expect((await r.dictation.history.stats()).dictations).toBe(3);
  });
});
