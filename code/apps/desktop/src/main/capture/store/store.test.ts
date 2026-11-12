import { describe, expect, it } from "vitest";
import { createStore, dayLabel, groupByDay, type CaptureRecord, type StoreFs } from "./index";

const rec = (id: string, at: number, extra: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id,
  kind: "recording",
  title: id,
  at,
  dir: id,
  bytes: 1,
  media: "m.webm",
  frames: [],
  chips: ["saved"],
  ...extra,
});

function memory(initial?: string): StoreFs & { text: string | undefined; slow: boolean } {
  const m = {
    text: initial,
    slow: false,
    read: async () => m.text,
    write: async (_: string, t: string) => {
      if (m.slow) await new Promise((r) => setTimeout(r, 5));
      m.text = t;
    },
  };
  return m;
}

describe("capture store", () => {
  it("lists newest first and searches title and words", async () => {
    const s = createStore(memory(), "i.json");
    await s.add(rec("old", 1000, { title: "Figma pricing" }));
    await s.add(rec("new", 2000, { title: "Excel", words: [{ text: "Quarterly", startMs: 0, endMs: 5 }] }));
    expect((await s.list()).map((r) => r.id)).toEqual(["new", "old"]);
    expect((await s.list("PRICING")).map((r) => r.id)).toEqual(["old"]);
    expect((await s.list("quarterly")).map((r) => r.id)).toEqual(["new"]);
    expect(await s.list("nothing like this")).toEqual([]);
    expect((await s.list("   ")).length).toBe(2);
  });
  it("reads a missing, empty or damaged index as an empty list", async () => {
    for (const text of [undefined, "", "{nope", '{"a":1}', '[1,"x",{"id":"ok","at":1,"dir":"d"}]']) {
      const list = await createStore(memory(text), "i.json").list();
      expect(list.map((r) => r.id)).toEqual(text?.includes('"ok"') ? ["ok"] : []);
    }
  });
  it("replaces a record added twice with the same id", async () => {
    const s = createStore(memory(), "i.json");
    await s.add(rec("a", 1, { title: "first" }));
    await s.add(rec("a", 1, { title: "second" }));
    expect((await s.list()).map((r) => r.title)).toEqual(["second"]);
  });
  it("updates a record and keeps its id; an unknown id changes nothing", async () => {
    const s = createStore(memory(), "i.json");
    await s.add(rec("a", 1));
    expect((await s.update("a", { chips: ["saved", "copied"], id: "zzz" } as Partial<CaptureRecord>))?.id).toBe("a");
    expect((await s.get("a"))?.chips).toEqual(["saved", "copied"]);
    expect(await s.update("missing", { title: "x" })).toBeUndefined();
  });
  it("removal works on the index as it is now: a capture added after a sweep read the list is not lost", async () => {
    const fs = memory();
    const s = createStore(fs, "i.json");
    await s.add(rec("old", 1));
    const stale = await s.list();
    await s.add(rec("fresh", 2));
    const removed = await s.remove(stale.map((r) => r.id));
    expect(removed.map((r) => r.id)).toEqual(["old"]);
    expect((await s.list()).map((r) => r.id)).toEqual(["fresh"]);
  });
  it("concurrent changes do not overwrite each other", async () => {
    const fs = memory();
    fs.slow = true;
    const s = createStore(fs, "i.json");
    await Promise.all([s.add(rec("a", 1)), s.add(rec("b", 2)), s.add(rec("c", 3)), s.remove(["a"])]);
    expect((await s.list()).map((r) => r.id).sort()).toEqual(["b", "c"]);
  });
  it("removing nothing or unknown ids does not write", async () => {
    const fs = memory();
    const s = createStore(fs, "i.json");
    expect(await s.remove(["x"])).toEqual([]);
    expect(fs.text).toBeUndefined();
  });
});

describe("day groups", () => {
  const now = new Date(2026, 10, 12, 15, 0).getTime();
  const at = (d: number, h = 9) => new Date(2026, 10, d, h).getTime();
  it("labels today, yesterday and older days", () => {
    expect(dayLabel(at(12), now)).toBe("Today");
    expect(dayLabel(at(11, 23), now)).toBe("Yesterday");
    expect(dayLabel(at(3), now)).toBe("Nov 3");
    expect(dayLabel(new Date(2025, 11, 30).getTime(), now)).toBe("Dec 30, 2025");
  });
  it("groups a sorted list by day in order", () => {
    const g = groupByDay([rec("a", at(12, 10)), rec("b", at(12, 9)), rec("c", at(11))], now);
    expect(g.map((x) => [x.label, x.items.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
    ]);
  });
});

describe("capture store with a damaged index", () => {
  it("moves a damaged or empty index aside instead of replacing it with a one-record list", async () => {
    for (const bad of ["{garbage", "", '{"a":1}']) {
      const aside: string[] = [];
      const fs = { ...memory(bad), moveAside: async (f: string) => void aside.push(f) };
      expect(await createStore(fs, "index.json").list()).toEqual([]);
      expect(aside).toEqual(["index.json"]);
    }
  });
  it("does not touch a missing index, and passes a read failure on instead of treating it as empty", async () => {
    const aside: string[] = [];
    const missing = { ...memory(undefined), moveAside: async (f: string) => void aside.push(f) };
    expect(await createStore(missing, "index.json").list()).toEqual([]);
    expect(aside).toEqual([]);
    const locked: StoreFs = {
      read: async () => {
        throw new Error("EACCES");
      },
      write: async () => {
        throw new Error("must not write");
      },
    };
    const store = createStore(locked, "index.json");
    await expect(store.list()).rejects.toThrow("EACCES");
    await expect(store.add(rec("a", 1))).rejects.toThrow("EACCES");
  });
  it("mutate works out the patch from the record as it is when it runs", async () => {
    const s = createStore(memory(), "i.json");
    await s.add(rec("a", 1, { edits: {} }));
    await Promise.all([s.mutate("a", (r) => ({ edits: { ...r.edits, x: "1" } })), s.mutate("a", (r) => ({ edits: { ...r.edits, y: "2" } }))]);
    expect((await s.get("a"))?.edits).toEqual({ x: "1", y: "2" });
    expect(await s.mutate("none", () => ({}))).toBeUndefined();
  });
});
