import { describe, expect, it } from "vitest";
import { createStore, type CaptureRecord, type StoreFs } from "../store";
import { sweepCaptures, type RetentionPorts } from "./index";

const DAY = 86_400_000;
const NOW = 100 * DAY;
const rec = (id: string, ageDays: number, extra: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id,
  kind: "recording",
  title: id,
  at: NOW - ageDays * DAY,
  dir: id,
  bytes: 1,
  media: "m",
  frames: [],
  chips: [],
  ...extra,
});

function setup(records: CaptureRecord[]) {
  let text = JSON.stringify(records);
  const fs: StoreFs = { read: async () => text, write: async (_, t) => void (text = t) };
  const store = createStore(fs, "i");
  const calls: string[] = [];
  const logs: string[] = [];
  const ports: RetentionPorts = {
    store,
    trash: async (d) => (calls.push(`trash ${d}`), true),
    removeDir: async (d) => void calls.push(`delete ${d}`),
    resolve: (d) => `/caps/${d}`,
    log: (l) => logs.push(l),
    now: () => NOW,
  };
  return { store, ports, calls, logs };
}

describe("capture retention", () => {
  it("moves captures older than the keep time to the Recycle Bin and drops them from the list", async () => {
    const s = setup([rec("old", 31), rec("edge", 29), rec("new", 1)]);
    expect(await sweepCaptures(30, s.ports)).toEqual({ removed: 1, trashed: 1, deleted: 0, failed: 0 });
    expect(s.calls).toEqual(["trash /caps/old"]);
    expect((await s.store.list()).map((r) => r.id)).toEqual(["new", "edge"]);
  });
  it("keeps everything when the keep time is 0 or not a number", async () => {
    const s = setup([rec("ancient", 900)]);
    expect((await sweepCaptures(0, s.ports)).removed).toBe(0);
    expect((await sweepCaptures(Number.NaN, s.ports)).removed).toBe(0);
    expect(s.calls).toEqual([]);
  });
  it("deletes for good, with a log line, when the Recycle Bin says no or throws", async () => {
    const s = setup([rec("a", 40), rec("b", 40)]);
    s.ports.trash = async (d) => {
      if (d.endsWith("b")) throw new Error("no bin");
      return false;
    };
    expect(await sweepCaptures(30, s.ports)).toEqual({ removed: 2, trashed: 0, deleted: 2, failed: 0 });
    expect(s.calls).toEqual(["delete /caps/a", "delete /caps/b"]);
    expect(s.logs).toHaveLength(2);
    expect(s.logs[0]).toContain("deleted for good");
  });
  it("keeps a capture in the list when its folder cannot be removed", async () => {
    const s = setup([rec("locked", 50), rec("free", 50)]);
    s.ports.trash = async () => false;
    s.ports.removeDir = async (d) => {
      if (d.endsWith("locked")) throw new Error("in use");
    };
    const r = await sweepCaptures(30, s.ports);
    expect(r).toMatchObject({ removed: 1, failed: 1 });
    expect((await s.store.list()).map((x) => x.id)).toEqual(["locked"]);
    expect(s.logs.some((l) => l.includes("in use"))).toBe(true);
  });
  it("never rewrites the list from a stale copy: a capture saved during the sweep stays", async () => {
    const s = setup([rec("old", 60)]);
    const trash = s.ports.trash;
    s.ports.trash = async (d) => {
      await s.store.add(rec("saved-meanwhile", 0));
      return trash(d);
    };
    await sweepCaptures(30, s.ports);
    expect((await s.store.list()).map((x) => x.id)).toEqual(["saved-meanwhile"]);
  });
  it("leaves a capture that is still being finished", async () => {
    const s = setup([rec("busy", 90, { finishing: true })]);
    expect((await sweepCaptures(30, s.ports)).removed).toBe(0);
  });
  it("handles an empty list", async () => {
    expect(await sweepCaptures(30, setup([]).ports)).toEqual({ removed: 0, trashed: 0, deleted: 0, failed: 0 });
  });
});
