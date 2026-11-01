import type { IconName } from "../icons";
import { cx, h, icon, rovingIndex, type Child } from "./dom";

export interface MenuItemOptions {
  label: string;
  icon?: IconName;
  shortcut?: string;
  destructive?: boolean;
  selected?: boolean;
  onSelect: () => void;
}
/** Same markup as <MenuItem>. */
export function menuItem(o: MenuItemOptions): HTMLButtonElement {
  return h(
    "button",
    { type: "button", role: "menuitem", class: cx("lm-menu__item", o.destructive && "is-destructive"), on: { click: o.onSelect } },
    o.icon && icon(o.icon),
    h("span", { class: "lm-menu__label" }, o.label),
    o.shortcut && h("span", { class: "lm-menu__shortcut" }, o.shortcut),
    o.selected && icon("check", 14, "lm-menu__check"),
  );
}

/** Same markup as <Menu>, with roving focus on the arrow keys. */
export function menu(...items: Node[]): HTMLDivElement {
  const el = h("div", { role: "menu", class: "lm-menu lm-menu--overlay" }, ...items);
  el.addEventListener("keydown", (e) => {
    const list = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const root = el.getRootNode() as Document | ShadowRoot;
    const i = list.indexOf(root.activeElement as HTMLElement);
    const n = rovingIndex(e.key, i, list.length, ["ArrowDown", "ArrowUp"]);
    if (n === undefined || n === -2) return;
    e.preventDefault();
    e.stopPropagation();
    list[(n + list.length) % list.length]?.focus();
  });
  return el;
}

/** Same markup as <PopoverSurface>. */
export function popoverSurface(title: string | undefined, ...children: Child[]): HTMLDivElement {
  return h("div", { class: "lm-popover", role: "dialog", "aria-label": title }, title && h("h3", { class: "lm-popover__title" }, title), ...children);
}
