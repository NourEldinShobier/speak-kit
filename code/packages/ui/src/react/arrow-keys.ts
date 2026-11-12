import type { KeyboardEvent } from "react";

/** Where an arrow key moves focus in a list of `count` items from item `at`; null when the key does nothing here. Ends do not wrap. */
export function arrowTarget(key: string, at: number, count: number): number | null {
  if (count <= 0 || at < 0) return null;
  if (key === "ArrowDown" || key === "ArrowRight") return Math.min(at + 1, count - 1);
  if (key === "ArrowUp" || key === "ArrowLeft") return Math.max(at - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * A keydown handler for a list container: arrow keys, Home and End move focus between the items that match `selector`. Only a key pressed on an item itself
 * counts, so a field or button inside a row keeps its own keys. Tab still walks every control.
 */
export function onArrowKeys(selector: string, both = false) {
  return (e: KeyboardEvent<HTMLElement>): void => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
    if (!both && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return; // a vertical list leaves Left and Right to the field or the page
    const to = arrowTarget(e.key, items.indexOf(e.target as HTMLElement), items.length);
    if (to === null) return;
    e.preventDefault();
    items[to]?.focus();
  };
}
