/** Which voice the detail drawer shows. `prev` and `next` carry the ids of the filtered list, because the list changes with the filter. */
export type DrawerState = { kind: "closed" } | { kind: "open"; id: string };

export type DrawerAction = { type: "open"; id: string } | { type: "prev"; ids: readonly string[] } | { type: "next"; ids: readonly string[] } | { type: "close" };

export const closedDrawer: DrawerState = { kind: "closed" };

export function drawerReducer(s: DrawerState, a: DrawerAction): DrawerState {
  switch (a.type) {
    case "open":
      return { kind: "open", id: a.id };
    case "close":
      return closedDrawer;
    case "prev":
      return step(s, a.ids, -1);
    case "next":
      return step(s, a.ids, 1);
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** The neighbour in the list; the first and the last voice stay where they are. */
function step(s: DrawerState, ids: readonly string[], by: 1 | -1): DrawerState {
  if (s.kind === "closed") return s;
  const next = ids[ids.indexOf(s.id) + by];
  return ids.includes(s.id) && next !== undefined ? { kind: "open", id: next } : s;
}

/** 1-based place of the open voice in the list ("2 of 28"), or null when closed or when the voice is not in the list. */
export function drawerPosition(s: DrawerState, ids: readonly string[]): number | null {
  const at = s.kind === "open" ? ids.indexOf(s.id) : -1;
  return at < 0 ? null : at + 1;
}
