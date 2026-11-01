import { describe, expect, it } from "vite-plus/test";
import type { DocMeta } from "../../../shared/library/contract";
import { clock, continueDoc, dayLabel, estimateMs, filterDocs, highlightParts, rowStatus, sortDocs, span, subtitle } from "./model";

const doc = (o: Partial<DocMeta>): DocMeta => ({
  id: "x",
  title: "T",
  source: "paste",
  format: "text",
  origin: "Pasted text",
  addedAt: 1,
  wordCount: 1500,
  progress: { sentence: 0, fraction: 0 },
  finished: false,
  ...o,
});

describe("durations", () => {
  it("estimates reading time from words and speed", () => {
    expect(estimateMs(1500, 1)).toBe(600_000);
    expect(estimateMs(1500, 2)).toBe(300_000);
  });
  it("formats clock and span", () => {
    expect([clock(147_000), clock(4_329_000), clock(0)]).toEqual(["2:27", "1:12:09", "0:00"]);
    expect([span(8_100_000), span(2_220_000), span(10_000)]).toEqual(["2h 15m", "37 min", "under 1 min"]);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 9, 30, 15).getTime(); // Fri 30 Oct 2026
  it.each([
    [new Date(2026, 9, 30, 8).getTime(), "Today"],
    [new Date(2026, 9, 29, 23).getTime(), "Yesterday"],
    [new Date(2026, 9, 26, 12).getTime(), "Mon"],
    [new Date(2026, 9, 20, 12).getTime(), "Oct 20"],
  ])("%s", (ts, label) => expect(dayLabel(ts, now)).toBe(label));
});

describe("filter and sort", () => {
  const docs = [
    doc({ id: "a", title: "beta", source: "url", addedAt: 3, openedAt: 10, wordCount: 10 }),
    doc({ id: "b", title: "Alpha", source: "file", addedAt: 2, finished: true, wordCount: 30 }),
    doc({ id: "c", title: "gamma", source: "paste", addedAt: 5, wordCount: 20 }),
  ];
  it("filters by source and unfinished", () => {
    expect(filterDocs(docs, "url").map((d) => d.id)).toEqual(["a"]);
    expect(filterDocs(docs, "unfinished").map((d) => d.id)).toEqual(["a", "c"]);
    expect(filterDocs(docs, "all")).toHaveLength(3);
  });
  it("sorts", () => {
    const ids = (s: Parameters<typeof sortDocs>[1]) => sortDocs(docs, s).map((d) => d.id);
    expect(ids("played")).toEqual(["a", "c", "b"]);
    expect(ids("added")).toEqual(["c", "a", "b"]);
    expect(ids("title")).toEqual(["b", "a", "c"]);
    expect(ids("length")).toEqual(["b", "c", "a"]);
  });
});

describe("continueDoc", () => {
  it("is the latest started, unfinished reading", () => {
    const docs = [
      doc({ id: "old", openedAt: 5, progress: { sentence: 4, fraction: 0.2 } }),
      doc({ id: "new", openedAt: 9, progress: { sentence: 1, fraction: 0.1 } }),
      doc({ id: "done", openedAt: 20, finished: true, progress: { sentence: 0, fraction: 1 } }),
      doc({ id: "unread", openedAt: 30 }),
    ];
    expect(continueDoc(docs)?.id).toBe("new");
    expect(continueDoc([])).toBeUndefined();
  });
});

describe("rowStatus", () => {
  it("covers finished, new and in progress", () => {
    expect(rowStatus(doc({ finished: true }), 1)).toEqual({ kind: "finished", percent: 100, label: "Finished" });
    expect(rowStatus(doc({}), 1)).toMatchObject({ kind: "new", label: "New" });
    expect(rowStatus(doc({ openedAt: 1, wordCount: 1500, progress: { sentence: 9, fraction: 0.5 } }), 1)).toEqual({ kind: "progress", percent: 50, label: "50% · 5 min left" });
  });
  it("describes the origin, with pages for PDFs", () => {
    expect(subtitle(doc({}))).toBe("Pasted text");
    expect(subtitle(doc({ source: "file", origin: "a.pdf", pages: 15 }))).toBe("a.pdf · 15 pages");
  });
});

describe("highlightParts", () => {
  it("marks every word of the query, ignoring case", () => {
    expect(highlightParts("Quiet return of local-first", "local QUIET")).toEqual([["Quiet", true], [" return of ", false], ["local", true], ["-first", false]]);
  });
  it("treats regex characters literally and returns the text for an empty query", () => {
    expect(highlightParts("a (b) c", "(b)")).toEqual([["a ", false], ["(b)", true], [" c", false]]);
    expect(highlightParts("plain", " ")).toEqual([["plain", false]]);
  });
});
