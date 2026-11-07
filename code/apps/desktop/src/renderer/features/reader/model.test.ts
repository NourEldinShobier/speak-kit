import { describe, expect, it } from "vite-plus/test";
import type { Block } from "../../../shared/library/contract";
import { buildDoc, findMatches, fractionAt, outline, ProgressSaver, SentenceClock, sentenceAt, SleepTimer, toggleBookmark, toReadDoc, wordAt } from "./model";

const blocks: Block[] = [
  { kind: "heading", text: "Title here", level: 1, page: 1 },
  { kind: "paragraph", text: "First sentence. Second sentence is longer.", page: 1 },
  { kind: "paragraph", text: "Third.", page: 2 },
  { kind: "heading", text: "Part two", level: 2, page: 2 },
];

describe("buildDoc", () => {
  const doc = buildDoc(blocks);
  it("splits blocks into sentences with block index and spans", () => {
    expect(doc.sentences.map((s) => [s.text, s.block, s.start, s.end])).toEqual([
      ["Title here", 0, 0, 10],
      ["First sentence.", 1, 0, 15],
      ["Second sentence is longer.", 1, 16, 42],
      ["Third.", 2, 0, 6],
      ["Part two", 3, 0, 8],
    ]);
    expect(doc.firstSentence).toEqual([0, 1, 3, 4]);
  });
  it("hands the player sentences with block numbers and a clamped start", () => {
    const rd = toReadDoc(doc, { id: "d1", title: "T", origin: "o" }, 99);
    expect(rd).toMatchObject({ docId: "d1", tabId: 0, startIndex: 4, source: "page" });
    expect(rd.sentences.map((s) => s.block)).toEqual([0, 1, 1, 2, 3]);
  });
  it("tells how far into the text a sentence starts", () => {
    expect(fractionAt(doc, 0)).toBe(0);
    expect(fractionAt(doc, 5)).toBe(1);
    expect(fractionAt(doc, 3)).toBeCloseTo(51 / 65, 5);
  });
  it("finds the sentence under a click offset", () => {
    expect(sentenceAt(doc, 1, 3)).toBe(1);
    expect(sentenceAt(doc, 1, 20)).toBe(2);
    expect(sentenceAt(doc, 2, 0)).toBe(3);
  });
});

describe("outline", () => {
  it("lists headings, and a Page entry per page for PDFs", () => {
    expect(outline(blocks, false)).toEqual([
      { label: "Title here", block: 0, level: 1 },
      { label: "Part two", block: 3, level: 2 },
    ]);
    expect(outline(blocks, true).map((o) => o.label)).toEqual(["Page 1", "Title here", "Page 2", "Part two"]);
  });
});

describe("findMatches", () => {
  it("finds every case-insensitive occurrence with block and offsets", () => {
    expect(findMatches(blocks, "SENTENCE")).toEqual([
      { block: 1, start: 6, end: 14 },
      { block: 1, start: 23, end: 31 },
    ]);
    expect(findMatches(blocks, " ")).toEqual([]);
  });
});

describe("wordAt", () => {
  const text = "Notes, documents and even voices lived on someone else's server.";
  it("moves through the sentence by word length", () => {
    expect(wordAt(text, 0)).toEqual({ start: 0, end: 6 });
    const w = wordAt(text, 0.45)!;
    expect(text.slice(w.start, w.end)).toBe("voices");
    const last = wordAt(text, 1)!;
    expect(text.slice(last.start, last.end)).toBe("server.");
  });
  it("has no word for empty text", () => {
    expect(wordAt("", 0.5)).toBeUndefined();
  });
});

describe("SentenceClock", () => {
  it("advances with time, freezes while paused and continues after resume", () => {
    const c = new SentenceClock();
    c.start(1000, 2000);
    expect(c.fraction(2000)).toBe(0.5);
    c.pause(2000);
    expect(c.fraction(9000)).toBe(0.5);
    c.resume(5000);
    expect(c.fraction(5500)).toBe(0.75);
    expect(c.fraction(99_000)).toBe(1);
    c.stop();
    expect(c.fraction(5500)).toBe(0);
  });
});

describe("SleepTimer", () => {
  it("counts down and reports expiry once", () => {
    const t = new SleepTimer();
    t.start(30, 0);
    expect(t.remainingMs(60_000)).toBe(29 * 60_000);
    expect(t.expired(29 * 60_000)).toBe(false);
    expect(t.expired(30 * 60_000)).toBe(true);
    expect(t.expired(31 * 60_000)).toBe(false);
    expect(t.active).toBe(false);
  });
  it("counts a minute as the length it is given", () => {
    const t = new SleepTimer();
    t.start(5, 1000, 300);
    expect(t.remainingMs(1000)).toBe(1500);
    expect(t.expired(2500)).toBe(true);
  });
  it("can be cancelled", () => {
    const t = new SleepTimer();
    t.start(5, 0);
    t.cancel();
    expect(t.expired(10 * 60_000)).toBe(false);
  });
});

describe("ProgressSaver", () => {
  it("saves at most once per interval and always on flush", () => {
    let now = 10_000;
    const saved: number[] = [];
    const s = new ProgressSaver(
      (p) => saved.push(p.sentence),
      () => now,
      3000,
    );
    s.update({ sentence: 1, fraction: 0.1 });
    now += 1000;
    s.update({ sentence: 2, fraction: 0.2 });
    now += 1000;
    s.update({ sentence: 3, fraction: 0.3 });
    expect(saved).toEqual([1]);
    now += 1500;
    s.update({ sentence: 4, fraction: 0.4 });
    expect(saved).toEqual([1, 4]);
    s.update({ sentence: 5, fraction: 0.5 });
    s.flush();
    expect(saved).toEqual([1, 4, 5]);
    s.flush();
    expect(saved).toEqual([1, 4, 5]);
  });
});

describe("toggleBookmark", () => {
  it("adds a bookmark labelled with the start of the sentence, keeping text order", () => {
    const one = toggleBookmark([], 4, "Part two");
    expect(one).toEqual([{ sentence: 4, label: "Part two" }]);
    expect(toggleBookmark(one, 1, "First   sentence.  ").map((b) => [b.sentence, b.label])).toEqual([
      [1, "First sentence."],
      [4, "Part two"],
    ]);
  });

  it("removes the bookmark when the sentence already has one", () => {
    const list = [
      { sentence: 1, label: "a" },
      { sentence: 3, label: "b" },
    ];
    expect(toggleBookmark(list, 1, "a")).toEqual([{ sentence: 3, label: "b" }]);
  });

  it("shortens a long label to 60 characters ending in an ellipsis", () => {
    const [b] = toggleBookmark([], 0, "word ".repeat(30));
    expect(b!.label).toHaveLength(60);
    expect(b!.label.endsWith("…")).toBe(true);
  });
});
