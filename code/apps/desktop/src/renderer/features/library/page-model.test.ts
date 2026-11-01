import { describe, expect, it } from "vite-plus/test";
import type { DocMeta } from "../../../shared/library/contract";
import { bodyKind, initLibraryUi, libraryReducer, libraryView, type LibraryAction } from "./page-model";

const doc = (id: string, over: Partial<DocMeta> = {}): DocMeta => ({
  id,
  title: id,
  source: "paste",
  format: "text",
  origin: "Pasted text",
  addedAt: 1,
  wordCount: 150,
  progress: { sentence: 0, fraction: 0 },
  finished: false,
  ...over,
});
const run = (...actions: LibraryAction[]) => actions.reduce(libraryReducer, initLibraryUi());

describe("libraryReducer", () => {
  it("starts empty with the default filter and sort", () => {
    expect(initLibraryUi()).toEqual({ query: "", filter: "all", sort: "played", dialog: null, toast: null, problems: [], dragging: 0 });
  });

  it("sets the query, filter, sort, dialog, toast and problems", () => {
    const s = run(
      { type: "query", query: "moby" },
      { type: "filter", filter: "unfinished" },
      { type: "sort", sort: "title" },
      { type: "dialog", dialog: { kind: "paste" } },
      { type: "toast", toast: { text: "Added", undo: "d1" } },
      { type: "problems", problems: ["a.pdf: too large"] },
    );
    expect(s).toEqual({ query: "moby", filter: "unfinished", sort: "title", dialog: { kind: "paste" }, toast: { text: "Added", undo: "d1" }, problems: ["a.pdf: too large"], dragging: 0 });
  });

  it("counts drag enter and leave events and never goes below zero", () => {
    expect(run({ type: "drag-enter" }, { type: "drag-enter" }, { type: "drag-leave" }).dragging).toBe(1);
    expect(run({ type: "drag-leave" }).dragging).toBe(0);
    expect(run({ type: "drag-enter" }, { type: "drag-enter" }, { type: "drag-end" }).dragging).toBe(0);
  });
});

describe("libraryView", () => {
  const docs = [doc("b", { title: "Bravo", wordCount: 300 }), doc("a", { title: "Alpha", finished: true })];

  it("filters, sorts and totals the audio length at speed 1 (150 words a minute)", () => {
    const v = libraryView(docs, { query: "", filter: "unfinished", sort: "title", hits: null, speed: 1 });
    expect(v.visible.map((d) => d.id)).toEqual(["b"]);
    expect(v.all).toHaveLength(2);
    expect(v.totalMs).toBe(180_000);
  });

  it("keeps only the search hits, and offers no resume while searching", () => {
    const hits = new Map([["a", { id: "a" }]]);
    const v = libraryView(docs, { query: "alp", filter: "all", sort: "title", hits, speed: 1 });
    expect(v.visible.map((d) => d.id)).toEqual(["a"]);
    expect(v.resume).toBeUndefined();
  });

  it("is empty before the readings are loaded", () => {
    expect(libraryView(null, { query: "", filter: "all", sort: "played", hits: null, speed: 1 })).toEqual({ all: [], visible: [], resume: undefined, totalMs: 0 });
  });
});

describe("bodyKind", () => {
  const some = [doc("a")];
  it.each([
    [false, [], [], false, "list"],
    [true, [], [], false, "library-empty"],
    [true, some, some, false, "list"],
    [true, some, [], true, "no-match"],
    [true, some, [], false, "filter-empty"],
  ] as const)("loaded %s, %j readings, %j visible, searching %s is %s", (loaded, all, visible, searching, kind) => {
    expect(bodyKind(loaded, { all: [...all], visible: [...visible] }, searching)).toBe(kind);
  });
});
