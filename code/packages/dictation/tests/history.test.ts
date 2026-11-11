import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { createHistory, MAX_ENTRIES, type HistoryEntry, type NewEntry } from "../src/history";
import type { Retention } from "../src/settings";
import { fakeClock, fakeStorage } from "./fakes";

const DAY = 86_400_000;
const entry = (at: number, text = "hello", extra: Partial<NewEntry> = {}): NewEntry => ({ at, text, raw: text, durationMs: 1000, ...extra });

function setup(retention: Retention = "7d", stored?: unknown) {
  const time = fakeClock(100 * DAY);
  const store = fakeStorage(stored);
  let current = retention;
  const history = createHistory({ storage: store.storage, clock: time.clock, retention: () => current });
  return { history, time, store, setRetention: (r: Retention) => (current = r) };
}

describe("history", () => {
  it("lists newest first", async () => {
    const { history, time } = setup();
    await history.add(entry(time.clock.now() - 3000, "one"));
    await history.add(entry(time.clock.now() - 1000, "three"));
    await history.add(entry(time.clock.now() - 2000, "two"));
    expect((await history.list()).map((e) => e.text)).toEqual(["three", "two", "one"]);
  });

  it("gives every entry its own id, also within the same millisecond", async () => {
    const { history } = setup();
    for (let i = 0; i < 3; i++) await history.add(entry(8_640_000_000));
    expect((await history.list()).map((e) => e.id)).toEqual(["8640000000-2", "8640000000-1", "8640000000-0"]);
  });

  it("limits the list", async () => {
    const { history, time } = setup();
    for (let i = 0; i < 5; i++) await history.add(entry(time.clock.now() - i, `t${i}`));
    expect((await history.list({ limit: 2 })).map((e) => e.text)).toEqual(["t0", "t1"]);
    expect(await history.list({ limit: 0 })).toEqual([]);
  });

  it("gets one entry by id", async () => {
    const { history, time } = setup();
    await history.add(entry(time.clock.now(), "find me"));
    const [saved] = await history.list();
    expect((await history.get(saved?.id ?? ""))?.text).toBe("find me");
    expect(await history.get("nope")).toBeUndefined();
  });

  it("removes one entry and clears all, saving after each", async () => {
    const { history, time, store } = setup();
    await history.add(entry(time.clock.now(), "a"));
    await history.add(entry(time.clock.now() - 1, "b"));
    const [first] = await history.list();
    await history.remove(first?.id ?? "");
    expect((store.state.value as HistoryEntry[]).map((e) => e.text)).toEqual(["b"]);
    await history.clear();
    expect(store.state.value).toEqual([]);
    expect(await history.list()).toEqual([]);
  });

  it("keeps the optional fields it was given and no others", async () => {
    const { history, time } = setup();
    await history.add(entry(time.clock.now(), "x", { app: "notepad.exe", language: "en", model: "turbo" }));
    expect(await history.list()).toMatchObject([{ app: "notepad.exe", language: "en", model: "turbo" }]);
  });
});

describe("search", () => {
  async function filled() {
    const s = setup();
    await s.history.add(entry(s.time.clock.now() - 3, "Buy milk and eggs", { app: "notepad.exe" }));
    await s.history.add(entry(s.time.clock.now() - 2, "Call Anna about the milk", { app: "chrome.exe" }));
    await s.history.add(entry(s.time.clock.now() - 1, "Meeting at noon"));
    return s.history;
  }
  const texts = async (q: string) => (await (await filled()).list({ search: q })).map((e) => e.text);

  it("matches in any case", async () => expect(await texts("MILK")).toEqual(["Call Anna about the milk", "Buy milk and eggs"]));
  it("needs every word, in any order", async () => expect(await texts("eggs milk")).toEqual(["Buy milk and eggs"]));
  it("matches the program name", async () => expect(await texts("chrome")).toEqual(["Call Anna about the milk"]));
  it("returns nothing when a word is missing", async () => expect(await texts("milk tea")).toEqual([]));
  it("treats a blank search as no search", async () => expect(await texts("   ")).toHaveLength(3));
  it("ignores extra spaces between words", async () => expect(await texts("  milk    eggs ")).toEqual(["Buy milk and eggs"]));
  it("does not search the raw text", async () => {
    const s = setup();
    await s.history.add({ at: s.time.clock.now(), text: "Hello", raw: "hallo secret", durationMs: 1 });
    expect(await s.history.list({ search: "secret" })).toEqual([]);
  });
});

describe("retention", () => {
  const rows: [Retention, number, boolean][] = [
    ["24h", DAY, true],
    ["24h", DAY + 1, false],
    ["7d", 7 * DAY, true],
    ["7d", 7 * DAY + 1, false],
    ["30d", 30 * DAY, true],
    ["30d", 30 * DAY + 1, false],
    ["forever", 90 * DAY, true],
  ];
  for (const [retention, age, kept] of rows)
    it(`${retention}: an entry ${age} ms old is ${kept ? "kept" : "dropped"}`, async () => {
      const { history, time, store } = setup(retention);
      await history.add(entry(time.clock.now() - age, "old"));
      expect(await history.list()).toHaveLength(kept ? 1 : 0);
      expect((store.state.value as unknown[] | undefined)?.length ?? 0).toBe(kept ? 1 : 0);
    });

  it("off stores nothing and saves nothing", async () => {
    const { history, time, store } = setup("off");
    await history.add(entry(time.clock.now(), "now"));
    expect(await history.list()).toEqual([]);
    expect(store.state.saves).toBe(0);
  });

  it("entries expire as time passes", async () => {
    const { history, time } = setup("24h");
    await history.add(entry(time.clock.now(), "fresh"));
    await time.advance(DAY);
    expect(await history.list()).toHaveLength(1);
    await time.advance(1);
    expect(await history.list()).toEqual([]);
  });

  it("switching to off empties the history on the next prune", async () => {
    const { history, time, setRetention, store } = setup("7d");
    await history.add(entry(time.clock.now(), "a"));
    setRetention("off");
    await history.prune();
    expect(await history.list()).toEqual([]);
    expect(store.state.value).toEqual([]);
  });

  it("shortening the retention drops what no longer fits", async () => {
    const { history, time, setRetention } = setup("30d");
    await history.add(entry(time.clock.now() - 2 * DAY, "two days"));
    await history.add(entry(time.clock.now() - 1000, "recent"));
    setRetention("24h");
    await history.prune();
    expect((await history.list()).map((e) => e.text)).toEqual(["recent"]);
  });

  it("prune saves nothing when nothing expired", async () => {
    const { history, time, store } = setup();
    await history.add(entry(time.clock.now(), "a"));
    const saves = store.state.saves;
    await history.prune();
    expect(store.state.saves).toBe(saves);
  });

  it("holds at most 500 entries, newest first", async () => {
    expect(MAX_ENTRIES).toBe(500);
    const { history, time, store } = setup("forever");
    for (let i = 0; i < 503; i++) await history.add(entry(time.clock.now() + i, `t${i}`));
    expect((store.state.value as unknown[]).length).toBe(500);
    const all = await history.list();
    expect(all).toHaveLength(500);
    expect(all[0]?.text).toBe("t502");
    expect(all.at(-1)?.text).toBe("t3");
  });

  it("only what the retention allows survives, for any ages and any retention", async () => {
    const windows: Record<string, number> = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, forever: Infinity };
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("24h", "7d", "30d", "forever"), fc.array(fc.integer({ min: 0, max: 60 * DAY }), { maxLength: 30 }), async (retention, ages) => {
        const { history, time } = setup(retention as Retention);
        const now = time.clock.now();
        for (const age of ages) await history.add(entry(now - age, `age-${age}`));
        const listed = (await history.list()).map((e) => e.at);
        const expected = ages
          .map((a) => now - a)
          .filter((at) => now - at <= (windows[retention] ?? 0))
          .sort((a, b) => b - a);
        expect(listed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});

describe("storage", () => {
  it("loads what was saved", async () => {
    const saved: HistoryEntry[] = [{ id: "a", at: 100 * DAY - 1000, text: "stored", raw: "stored", durationMs: 5 }];
    const { history } = setup("7d", saved);
    expect(await history.list()).toEqual(saved);
  });

  it("keeps at most 500 stored entries", async () => {
    const stored = Array.from({ length: 520 }, (_, i) => ({ id: `e${i}`, at: 100 * DAY - i, text: "t", raw: "t", durationMs: 1 }));
    const { history } = setup("7d", stored);
    const all = await history.list();
    expect(all).toHaveLength(500);
    expect(all[0]?.id).toBe("e0");
  });

  it("sorts what it loads newest first", async () => {
    const mk = (id: string, at: number) => ({ id, at: 100 * DAY - at, text: id, raw: id, durationMs: 1 });
    const { history } = setup("7d", [mk("old", 2000), mk("new", 1000)]);
    expect((await history.list()).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("keeps only well-formed entries from stored data", async () => {
    const good = { id: "ok", at: 100 * DAY, text: "t", raw: "r", durationMs: 1 };
    const bad = [undefined, null, 5, "x", {}, { ...good, id: 1 }, { ...good, at: "1" }, { ...good, text: 2 }, { ...good, raw: undefined }, { ...good, durationMs: "1" }];
    const { history } = setup("forever", [...bad, good]);
    expect(await history.list()).toEqual([good]);
  });

  it("starts empty when the stored value is not a list", async () => {
    for (const junk of [undefined, null, 5, "text", { a: 1 }]) expect(await setup("7d", junk).history.list()).toEqual([]);
  });

  it("starts empty when the storage cannot be read, and the next save replaces it", async () => {
    const { history, store, time } = setup();
    store.state.failLoad = true;
    expect(await history.list()).toEqual([]);
    store.state.failLoad = false;
    await history.add(entry(time.clock.now(), "fresh"));
    expect((store.state.value as unknown[]).length).toBe(1);
  });

  it("keeps working in memory when saving fails", async () => {
    const { history, store, time } = setup();
    store.state.failSave = true;
    await history.add(entry(time.clock.now(), "kept"));
    expect((await history.list()).map((e) => e.text)).toEqual(["kept"]);
    store.state.failSave = false;
    await history.add(entry(time.clock.now(), "second"));
    expect((store.state.value as HistoryEntry[]).map((e) => e.text).sort()).toEqual(["kept", "second"]);
  });

  it("loads the storage once", async () => {
    let loads = 0;
    const time = fakeClock(100 * DAY);
    const history = createHistory({
      storage: {
        load: async () => (loads++, []),
        save: async () => {},
      },
      clock: time.clock,
      retention: () => "7d",
    });
    await Promise.all([history.list(), history.list(), history.add(entry(time.clock.now()))]);
    expect(loads).toBe(1);
  });

  it("saves in the order the changes were made", async () => {
    const time = fakeClock(100 * DAY);
    const saved: number[] = [];
    const history = createHistory({
      storage: {
        load: async () => [],
        save: async (v) => {
          await new Promise((r) => setTimeout(r, saved.length === 0 ? 20 : 0));
          saved.push((v as unknown[]).length);
        },
      },
      clock: time.clock,
      retention: () => "7d",
    });
    await Promise.all([history.add(entry(time.clock.now(), "a")), history.add(entry(time.clock.now() + 1, "b")), history.add(entry(time.clock.now() + 2, "c"))]);
    expect(saved).toEqual([1, 2, 3]);
  });
});
