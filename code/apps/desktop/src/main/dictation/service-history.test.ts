import { describe, expect, it } from "vite-plus/test";
import type { Dictation } from "@speakkit/dictation";
import { DictationHistory } from "./service-history";

describe("dictation history list", () => {
  it("passes the search and the limit on, and nothing when neither is given", async () => {
    const asked: unknown[] = [];
    const core = { history: { list: async (q: unknown) => (asked.push(q), [{ id: "1", at: 1, text: "a", raw: "a", durationMs: 1 }]) } } as unknown as Dictation;
    const h = new DictationHistory({ ready: async () => {}, core: () => core, changed: async () => {} });
    await h.list();
    await h.list("milk", 3);
    await h.list(undefined, 2);
    expect(asked).toEqual([undefined, { search: "milk", limit: 3 }, { limit: 2 }]);
  });
});
