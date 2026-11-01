import type { Placement } from "./ui-types";

/** Popover above the dock (or above its anchor when there is no dock): right edges aligned, 26 px gap (design B15/B16). */
export const above = (getDock: () => HTMLElement | null): Placement => (el, a, shell) => {
  const W = shell.width;
  const H = shell.height;
  const w = el.offsetWidth;
  const ph = el.offsetHeight;
  const dock = getDock();
  let top = (dock ? dock.getBoundingClientRect().top : a.top) - (dock ? 26 : 10) - ph;
  if (top < 8 && !dock) top = Math.min(a.bottom + 8, H - ph - 8);
  el.style.top = `${Math.max(8, top)}px`;
  el.style.left = `${Math.min(Math.max(8, a.right - w), W - w - 8)}px`;
};

/** Popover on the page side of the edge launcher pill. */
export const beside = (side: "left" | "right"): Placement => (el, a, shell) => {
  const W = shell.width;
  const H = shell.height;
  const w = el.offsetWidth;
  const ph = el.offsetHeight;
  el.style.left = `${side === "left" ? Math.min(a.right + 14, W - w - 8) : Math.max(8, a.left - 14 - w)}px`;
  el.style.top = `${Math.min(Math.max(8, a.bottom - ph), H - ph - 8)}px`;
};
