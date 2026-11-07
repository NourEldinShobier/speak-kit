import type { SearchHit, DocMeta } from "../../../shared/library/contract";
import { continueDoc, estimateMs, filterDocs, sortDocs, type FilterId, type SortId } from "./model";

/** The dialog that is open on the library page, with the reading it is about. */
export type Dialog = { kind: "paste" | "url" } | { kind: "rename" | "voice" | "delete"; doc: DocMeta } | null;

export interface ToastState {
  text: string;
  /** Id of the reading to bring back. */
  undo?: string;
}

/** Everything the library page remembers besides the readings themselves. */
export interface LibraryUi {
  query: string;
  filter: FilterId;
  sort: SortId;
  dialog: Dialog;
  toast: ToastState | null;
  /** Import failures shown in the banner. */
  problems: string[];
  /** Files being dragged over the page (enter minus leave events). */
  dragging: number;
}

export type LibraryAction =
  | { type: "query"; query: string }
  | { type: "filter"; filter: FilterId }
  | { type: "sort"; sort: SortId }
  | { type: "dialog"; dialog: Dialog }
  | { type: "toast"; toast: ToastState | null }
  | { type: "problems"; problems: string[] }
  | { type: "drag-enter" }
  | { type: "drag-leave" }
  | { type: "drag-end" };

export const initLibraryUi = (): LibraryUi => ({ query: "", filter: "all", sort: "played", dialog: null, toast: null, problems: [], dragging: 0 });

export function libraryReducer(s: LibraryUi, a: LibraryAction): LibraryUi {
  switch (a.type) {
    case "query":
      return { ...s, query: a.query };
    case "filter":
      return { ...s, filter: a.filter };
    case "sort":
      return { ...s, sort: a.sort };
    case "dialog":
      return { ...s, dialog: a.dialog };
    case "toast":
      return { ...s, toast: a.toast };
    case "problems":
      return { ...s, problems: a.problems };
    case "drag-enter":
      return { ...s, dragging: s.dragging + 1 };
    case "drag-leave":
      return { ...s, dragging: Math.max(0, s.dragging - 1) };
    case "drag-end":
      return { ...s, dragging: 0 };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** The readings as the page shows them. */
export interface LibraryView {
  all: DocMeta[];
  visible: DocMeta[];
  /** "Continue listening", not offered while searching. */
  resume: DocMeta | undefined;
  /** Estimated audio length of every reading, in ms. */
  totalMs: number;
}

export function libraryView(docs: DocMeta[] | null, o: Pick<LibraryUi, "query" | "filter" | "sort"> & { hits: ReadonlyMap<string, SearchHit> | null; speed: number }): LibraryView {
  const { hits, speed, ...ui } = o;
  const all = docs ?? [];
  const sorted = sortDocs(filterDocs(all, ui.filter), ui.sort);
  return {
    all,
    visible: hits ? sorted.filter((d) => hits.has(d.id)) : sorted,
    resume: ui.query ? undefined : continueDoc(all),
    totalMs: all.reduce((n, d) => n + estimateMs(d.wordCount, speed), 0),
  };
}

type BodyKind = "list" | "library-empty" | "no-match" | "filter-empty";

/** What fills the page under the header: the list, or the empty state that explains why there is none. */
export function bodyKind(loaded: boolean, view: Pick<LibraryView, "all" | "visible">, searching: boolean): BodyKind {
  if (!loaded) return "list";
  if (view.all.length === 0) return "library-empty";
  if (view.visible.length > 0) return "list";
  return searching ? "no-match" : "filter-empty";
}
