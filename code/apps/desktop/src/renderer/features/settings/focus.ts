import { SETTING_ROWS } from "../../../shared/settings/search-index";

/** The row a search result or a deep link asked for; the page it lives on reads it once after it mounts. */
let pending: string | null = null;

const listeners = new Set<() => void>();

/** A page that is already open hears about a request through this; one that opens later reads it when it mounts. */
export const subscribeRow = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export const requestRow = (id: string | null): void => {
  pending = id;
  for (const l of listeners) l();
};
export const peekRow = (): string | null => pending;
export const takeRow = (): string | null => {
  const id = pending;
  pending = null;
  return id;
};

/** True when `row` is a row behind the Advanced fold of `page`. */
export const isAdvancedRow = (page: string, row: string | null): boolean => !!row && SETTING_ROWS.some((r) => r.id === row && r.page === page && r.advanced);

/** The data attribute that ties a rendered row to its entry in the search index. */
export const rowAttr = (id: string) => ({ "data-setting-row": id }) as const;

/** Scrolls the requested row into view and rings it for a moment. Returns false when the page has no such row. */
export function revealRow(root: ParentNode, id: string, ms = 2500): boolean {
  const el = root.querySelector<HTMLElement>(`[data-setting-row="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView?.({ block: "center" });
  el.setAttribute("data-focus-ring", "");
  setTimeout(() => el.removeAttribute("data-focus-ring"), ms);
  return true;
}
