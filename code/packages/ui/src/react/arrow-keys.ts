import type { KeyboardEvent } from "react";

/** Where an arrow key moves focus in a list of `count` items from item `at`; null when the key does nothing here. Ends do not wrap. `both` also takes Left and Right (a row of cards); a vertical list takes Up, Down, Home and End only. */
export function arrowTarget(key: string, at: number, count: number, both = true): number | null {
  if (count <= 0 || at < 0) return null;
  if (key === "ArrowDown" || (both && key === "ArrowRight")) return Math.min(at + 1, count - 1);
  if (key === "ArrowUp" || (both && key === "ArrowLeft")) return Math.max(at - 1, 0);
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
    const to = arrowTarget(e.key, items.indexOf(e.target as HTMLElement), items.length, both);
    if (to === null) return;
    e.preventDefault();
    items[to]?.focus();
  };
}
