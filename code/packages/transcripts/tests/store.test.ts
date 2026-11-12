import { describe, expect, test } from "vitest";
import { openStore, StoreError } from "../src";
import { clock, DIR, ids, MemFs } from "./fakes";

const open = async (fs = new MemFs(), c = clock()) => ({ fs, c, store: await openStore({ dir: DIR, fs, now: c.now, newId: ids() }) });

describe("store", () => {
  test("adds an entry with defaults and lists newest first", async () => {
    const { store, c } = await open();
    const a = await store.add({ title: "A", source: "file" });
    c.advance(1000);
    const b = await store.add({ title: "B", source: "microphone" });
    expect(a).toMatchObject({ id: "t1", title: "A", status: "queued", language: "auto", chunksDone: 0, audioBytes: 0, exports: [], createdAt: 1_700_000_000_000 });
    expect(store.list().map((e) => e.id)).toEqual([b.id, a.id]);
  });

  test("persists to manifest.json and reloads", async () => {
    const { store, fs } = await open();
    await store.add({ title: "Kept", source: "file", status: "done" });
    await store.saveSegments("t1", [{ start: 0, end: 5, text: "hello" }]);
    const again = await openStore({ dir: DIR, fs, now: () => 1, newId: ids() });
    expect(again.list().map((e) => e.title)).toEqual(["Kept"]);
    expect(await again.segments("t1")).toEqual([{ start: 0, end: 5, text: "hello" }]);
    expect(JSON.parse(fs.text(`${DIR}/manifest.json`)!).version).toBe(1);
  });

  test("a failed write leaves memory as it was (disk full)", async () => {
    const { store, fs } = await open();
    await store.add({ title: "One", source: "file" });
    fs.fullAfter = fs.writes;
    await expect(store.add({ title: "Two", source: "file" })).rejects.toThrow("The disk is full.");
    expect(store.list().map((e) => e.title)).toEqual(["One"]);
    await expect(store.update("t1", { title: "Changed" })).rejects.toThrow();
    expect(store.get("t1")!.title).toBe("One");
  });

  test("an update with undefined removes the field; an unknown id is not-found", async () => {
    const { store } = await open();
    await store.add({ title: "x", source: "file", failure: { code: "failed", message: "m" } });
    const e = await store.update("t1", { failure: undefined, title: "y" });
    expect("failure" in e).toBe(false);
    expect(e.title).toBe("y");
    await expect(store.update("nope", {})).rejects.toMatchObject({ code: "not-found" });
    await expect(store.trash("nope")).rejects.toBeInstanceOf(StoreError);
    await expect(store.restore("nope")).rejects.toMatchObject({ code: "not-found" });
  });

  test("trash hides from the list, restore brings it back, remove deletes words and audio", async () => {
    const { store, fs, c } = await open();
    await store.add({ title: "T", source: "file", status: "done" });
    await store.saveSegments("t1", [{ start: 0, end: 1, text: "w" }]);
    await store.putAudio("t1", new Uint8Array([1, 2, 3]));
    expect(store.get("t1")!.audioBytes).toBe(3);
    await store.trash("t1");
    expect(store.list()).toEqual([]);
    expect(store.list(true)[0]!.trashedAt).toBe(c.now());
    c.advance(5000);
    await store.trash("t1"); // a second trash keeps the first time
    expect(store.get("t1")!.trashedAt).toBe(1_700_000_000_000);
    await store.restore("t1");
    expect(store.list().map((e) => e.id)).toEqual(["t1"]);
    expect(store.get("t1")!.trashedAt).toBeUndefined();
    await store.remove("t1");
    expect(store.get("t1")).toBeUndefined();
    expect([...fs.files.keys()].filter((k) => k !== `${DIR}/manifest.json`)).toEqual([]);
    await store.remove("t1"); // gone already: no error
  });

  test("empty trash deletes only trashed entries", async () => {
    const { store } = await open();
    await store.add({ title: "a", source: "file" });
    await store.add({ title: "b", source: "file" });
    await store.add({ title: "c", source: "file" });
    await store.trash("t1");
    await store.trash("t3");
    expect(await store.emptyTrash()).toBe(2);
    expect(store.list().map((e) => e.id)).toEqual(["t2"]);
    expect(store.list(true)).toEqual([]);
  });

  test("audio can be dropped on its own and the removal is recorded", async () => {
    const { store, fs, c } = await open();
    await store.add({ title: "a", source: "file", status: "done" });
    await store.putAudio("t1", new Uint8Array(10));
    await store.dropAudio("t1");
    expect(await store.readAudio("t1")).toBeUndefined();
    expect(store.get("t1")).toMatchObject({ audioBytes: 0, audioRemovedAt: c.now() });
    expect(fs.files.has(store.audioPath("t1"))).toBe(false);
  });

  test("work in progress at the last quit becomes interrupted; a recording is marked recovered", async () => {
    const fs = new MemFs();
    const first = await open(fs);
    const add = async (e: Parameters<typeof first.store.add>[0]) => {
      first.c.advance(1);
      await first.store.add(e);
    };
    await add({ title: "q", source: "file", status: "queued" });
    await add({ title: "t", source: "file", status: "transcribing" });
    await add({ title: "r", source: "microphone", status: "recording" });
    await add({ title: "d", source: "file", status: "done" });
    const second = await openStore({ dir: DIR, fs, now: () => 1, newId: ids() });
    expect(second.list().map((e) => [e.title, e.status, e.recovered ?? false])).toEqual([
      ["d", "done", false],
      ["r", "interrupted", true],
      ["t", "interrupted", false],
      ["q", "interrupted", false],
    ]);
  });

  test("an unreadable manifest is moved aside and the store starts empty", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode("{not json"));
    const { store } = await open(fs, clock(42));
    expect(store.list()).toEqual([]);
    expect(store.recoveredFrom?.replaceAll("\\", "/")).toBe(`${DIR}/manifest.bad-42.json`);
    expect(fs.text(`${DIR}/manifest.bad-42.json`)).toBe("{not json");
    expect(fs.files.has(`${DIR}/manifest.json`)).toBe(false);
  });

  test("a manifest without an entries list counts as unreadable", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode('{"version":1}'));
    const { store } = await open(fs);
    expect(store.recoveredFrom).toBeDefined();
  });

  test("a manifest that cannot be read is left untouched and nothing is written over it", async () => {
    const fs = new MemFs();
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 1, entries: [] })));
    const before = fs.text(`${DIR}/manifest.json`);
    const locked = Object.assign(Object.create(fs), {
      read: async () => {
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      },
    });
    const { store } = await open(locked);
    expect(store.unreadable).toBe(true);
    expect(store.list()).toEqual([]);
    await expect(store.add({ title: "n", source: "file" })).rejects.toMatchObject({ code: "unreadable" });
    expect(fs.text(`${DIR}/manifest.json`)).toBe(before);
  });

  test("a manifest from a newer version is read but never written", async () => {
    const fs = new MemFs();
    const entry = { id: "x", title: "from the future", createdAt: 1, source: "file", status: "done", exports: [] };
    fs.files.set(`${DIR}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 9, entries: [entry] })));
    const before = fs.text(`${DIR}/manifest.json`);
    const { store } = await open(fs);
    expect(store.newer).toBe(true);
    expect(store.list()).toHaveLength(1);
    await expect(store.add({ title: "n", source: "file" })).rejects.toMatchObject({ code: "newer-version" });
    await expect(store.trash("x")).rejects.toMatchObject({ code: "newer-version" });
    expect(fs.text(`${DIR}/manifest.json`)).toBe(before);
  });

  test("rows without an id are skipped and a broken words file reads as empty", async () => {
    const fs = new MemFs();
    fs.files.set(
      `${DIR}/manifest.json`,
      new TextEncoder().encode(JSON.stringify({ version: 1, entries: [null, { title: "no id" }, { id: "ok", title: "ok", createdAt: 1, status: "done", exports: [] }] })),
    );
    fs.files.set(`${DIR}/items/ok.json`, new TextEncoder().encode("garbage"));
    const { store } = await open(fs);
    expect(store.list().map((e) => e.id)).toEqual(["ok"]);
    expect(await store.segments("ok")).toEqual([]);
    expect(await store.segments("missing")).toEqual([]);
    fs.files.set(`${DIR}/items/ok.json`, new TextEncoder().encode('{"segments":5}'));
    expect(await store.segments("ok")).toEqual([]);
  });

  test("concurrent writes all land, in order", async () => {
    const { store, fs } = await open();
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.add({ title: `n${i}`, source: "file" })));
    expect(store.list()).toHaveLength(20);
    const again = await openStore({ dir: DIR, fs, now: () => 1, newId: ids() });
    expect(again.list()).toHaveLength(20);
  });
});
