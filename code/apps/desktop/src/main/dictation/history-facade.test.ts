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
