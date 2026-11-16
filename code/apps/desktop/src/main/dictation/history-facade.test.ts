import type { Dictation, HistoryEntry } from "@speakkit/dictation";
import { describe, expect, it } from "vite-plus/test";
import { HistoryFacade } from "./history-facade";

function rig(entries: Pick<HistoryEntry, "id" | "text">[], insertOk = true) {
  const inserted: string[] = [];
  const core = {
    history: {
      list: async () => entries,
      insert: async (id: string) => (inserted.push(id), insertOk),
      copy: async () => true,
    },
  } as unknown as Dictation;
  const facade = new HistoryFacade({ core: () => core, ready: async () => undefined, changed: () => undefined });
  return { facade, inserted };
}

describe("HistoryFacade.pasteLast", () => {
  it("inserts the newest entry again and reports whether it went in", async () => {
    const r = rig([
      { id: "new", text: "second" },
      { id: "old", text: "first" },
    ]);
    await r.facade.refresh();
    expect(await r.facade.pasteLast()).toBe(true);
    expect(r.inserted).toEqual(["new"]);
  });

  it("is false when the insertion fails", async () => {
    const r = rig([{ id: "new", text: "second" }], false);
    await r.facade.refresh();
    expect(await r.facade.pasteLast()).toBe(false);
  });

  it("does nothing with an empty history", async () => {
    const r = rig([]);
    await r.facade.refresh();
    expect(await r.facade.pasteLast()).toBe(false);
    expect(r.inserted).toEqual([]);
  });
});

describe("HistoryFacade.list", () => {
  it("passes the search and the limit on, and nothing when neither is given", async () => {
    const asked: unknown[] = [];
    const core = { history: { list: async (q: unknown) => (asked.push(q), [{ id: "1", at: 1, text: "a", raw: "a", durationMs: 1 }]) } } as unknown as Dictation;
    const h = new HistoryFacade({ ready: async () => {}, core: () => core, changed: () => {} });
    await h.list();
    await h.list("milk", 3);
    await h.list(undefined, 2);
    expect(asked).toEqual([undefined, { search: "milk", limit: 3 }, { limit: 2 }]);
  });
});
