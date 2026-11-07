import type { ReadDoc } from "@speakkit/protocol";
import { describe, expect, it } from "vite-plus/test";
import { DocQueue } from "./queue";

const doc = (docId: string, text: string): ReadDoc => ({ docId, tabId: 7, title: `T ${docId}`, url: `http://x/${docId}`, source: "page", startIndex: 0, sentences: [{ text, block: 0 }] }) as ReadDoc;

describe("DocQueue", () => {
  it("ignores a document that is already queued", () => {
    const q = new DocQueue();
    expect([q.add(doc("a", "x")), q.add(doc("a", "x")), q.length]).toEqual([true, false, 1]);
  });

  it("takes by id, shifts in order, removes and clears", () => {
    const q = new DocQueue();
    for (const id of ["a", "b", "c", "d"]) q.add(doc(id, "x"));
    expect(q.take("c")?.docId).toBe("c");
    expect(q.take("zzz")).toBeUndefined();
    expect(q.shift()?.docId).toBe("a");
    q.remove("b");
    expect(q.items(1).map((i) => i.docId)).toEqual(["d"]);
    q.clear();
    expect(q.length).toBe(0);
  });

  it("estimates reading time at 15 characters per second divided by the speed", () => {
    const q = new DocQueue();
    q.add(doc("a", "a".repeat(30)));
    expect(q.items(1)[0]).toEqual({ docId: "a", tabId: 7, title: "T a", url: "http://x/a", sentenceCount: 1, estMs: 2000 });
    expect(q.items(2)[0]!.estMs).toBe(1000);
  });
});
