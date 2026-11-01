/**
 * Vanilla (no React) builders that produce the same markup as the React components, for the content script
 * (Shadow DOM). Styles: inject lumen.css into the shadow root and put class "lm" on the container.
 * Icons are built with createElementNS (no innerHTML), so Trusted Types pages are fine.
 */
import { LOGO_COLORS, logoVariant } from "./logo";
import { ICON_DATA, iconAttrs, type IconName } from "./icons";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "g"]);

type Child = Node | string | number | false | null | undefined;
export type Props = Record<string, unknown> & {
  class?: string;
  style?: string;
  on?: Record<string, (e: Event) => void>;
};

/** h("button", { class: "lm-btn", type: "button", on: { click } }, "Label") */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): Element;
export function h(tag: string, props?: Props | null, ...children: Child[]): Element {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v == null) continue;
    if (k === "on") {
      for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) el.addEventListener(ev, fn);
    } else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === false || c == null) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Inline SVG for a Tabler outline icon; stroke is 1.5px on screen at any size (see lumen.css). */
export function icon(name: IconName, size = 16, extraClass?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  const a = iconAttrs(name, size);
  svg.setAttribute("class", extraClass ? `${a.class} ${extraClass}` : a.class);
  svg.setAttribute("style", a.style);
  svg.setAttribute("viewBox", a.viewBox);
  svg.setAttribute("aria-hidden", a["aria-hidden"]);
  svg.setAttribute("focusable", a.focusable);
  for (const m of ICON_DATA[name].matchAll(/<(\w+)([^>]*)\/>/g)) {
    const child = document.createElementNS(SVG_NS, m[1] ?? "path");
    for (const at of (m[2] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(at[1] ?? "", at[2] ?? "");
    svg.append(child);
  }
  return svg;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  label?: string;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  onClick?: (e: Event) => void;
  ariaLabel?: string;
}

export function button(o: ButtonOptions = {}): HTMLButtonElement {
  const variant = o.variant ?? "secondary";
  const lead = o.loading ? "loader-2" : o.iconLeft;
  return h(
    "button",
    {
      type: "button",
      class: cx("lm-btn", `lm-btn--${variant}`, o.size === "sm" && "lm-btn--sm", o.size === "lg" && "lm-btn--lg", o.loading && "is-loading"),
      disabled: o.disabled,
      "aria-busy": o.loading ? "true" : undefined,
      "aria-label": o.ariaLabel,
      on: o.onClick ? { click: o.onClick } : undefined,
    },
    lead && icon(lead, 16, o.loading ? "lm-spin" : undefined),
    o.label,
    o.iconRight && icon(o.iconRight, 16),
  );
}

export interface IconButtonOptions {
  name: IconName;
  label: string;
  size?: 32 | 28 | 24;
  round?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: Event) => void;
  /** extra classes and data attributes (for example data-sk hooks) */
  className?: string;
  data?: Record<string, string>;
}

export function iconButton(o: IconButtonOptions): HTMLButtonElement {
  const size = o.size ?? 32;
  return h(
    "button",
    {
      type: "button",
      class: cx("lm-btn lm-btn--icon", size === 28 && "lm-btn--sm", size === 24 && "lm-btn--xs", o.round && "lm-btn--round", o.loading && "is-loading", o.className),
      "aria-label": o.label,
      "aria-busy": o.loading ? "true" : undefined,
      disabled: o.disabled,
      on: o.onClick ? { click: o.onClick } : undefined,
      ...Object.fromEntries(Object.entries(o.data ?? {}).map(([k, v]) => [`data-${k}`, v])),
    },
    icon(o.loading ? "loader-2" : o.name, size === 24 ? 14 : 16, o.loading ? "lm-spin" : undefined),
  );
}

export interface ToggleOptions {
  checked?: boolean;
  disabled?: boolean;
  board?: boolean;
  label?: string;
  onChange?: (checked: boolean) => void;
}

/** role=switch button (same markup as the Radix-based <Toggle>): Space and Enter toggle it natively (button click). */
export function toggle(o: ToggleOptions = {}): HTMLButtonElement {
  const state = (on: boolean) => (on ? "checked" : "unchecked");
  const knob = h("span", { class: "lm-toggle__knob", "data-state": state(!!o.checked), "data-disabled": o.disabled });
  const el = h(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": String(!!o.checked),
      "data-state": state(!!o.checked),
      value: "on",
      class: cx("lm-toggle", o.board && "lm-toggle--board"),
      "aria-label": o.label,
      "data-disabled": o.disabled,
      disabled: o.disabled,
    },
    knob,
  );
  el.addEventListener("click", () => {
    const next = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(next));
    el.dataset.state = knob.dataset.state = state(next);
    o.onChange?.(next);
  });
  return el;
}

export type PillTone = "green" | "blue" | "orange" | "red" | "purple" | "yellow" | "neutral";
export function pill(text: string, tone: PillTone = "neutral", iconName?: IconName): HTMLSpanElement {
  return h("span", { class: `lm-pill lm-pill--${tone}` }, iconName && icon(iconName, 12, iconName === "loader-2" ? "lm-spin" : undefined), text);
}

export function kbd(text: string, small = false): HTMLElement {
  return h("kbd", { class: cx("lm-kbd", small && "lm-kbd--sm") }, text);
}

let tipId = 0;
/** Wraps `target`; the tooltip shows on hover and keyboard focus (CSS only). */
export function tooltip(target: HTMLElement, text: string, shortcut?: string): HTMLSpanElement {
  const id = `lm-tip-${++tipId}`;
  target.setAttribute("aria-describedby", id);
  return h("span", { class: "lm-tip" }, target, h("span", { role: "tooltip", id, class: "lm-tooltip" }, text, shortcut && kbd(shortcut, true)));
}

/** SpeakKit brand mark (same markup as <Logo>). */
export function logo(size = 24): HTMLSpanElement {
  const v = logoVariant(size);
  const svg = h("svg", { viewBox: "0 0 512 512", focusable: "false" }, ...v.pieces.map((p, i) => h("path", { d: p, fill: LOGO_COLORS.pieces[i] })));
  svg.append(
    h("path", { d: v.hub, fill: LOGO_COLORS.hub }),
    h("path", { d: v.wave, fill: "none", stroke: LOGO_COLORS.wave, "stroke-width": v.waveWidth, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
  return h("span", { class: "lm-logo", style: `--s:${size}`, "aria-hidden": "true" }, svg);
}

/** Initial in a coloured circle (same markup as <Avatar>); tone "accent" uses the brand colour. */
export function avatar(name: string, size = 32, tone: PillTone | "accent" = "purple"): HTMLSpanElement {
  return h(
    "span",
    { class: tone === "accent" ? "lm-avatar" : `lm-avatar lm-tone-${tone}`, style: tone === "accent" ? `--s:${size};--tone:var(--accent-default)` : `--s:${size}` },
    name.slice(0, 1).toUpperCase(),
  );
}

export interface ProgressHandle {
  el: HTMLDivElement;
  /** 0..100, or undefined for the indeterminate bar */
  set(value: number | undefined): void;
}
/** Same markup as <ProgressBar>. */
export function progress(value: number | undefined, o: { thin?: boolean; label?: string } = {}): ProgressHandle {
  const el = h(
    "div",
    { role: "progressbar", "aria-label": o.label, "aria-valuemin": 0, "aria-valuemax": 100, class: cx("lm-progress", o.thin && "lm-progress--thin") },
    h("div", { class: "lm-progress__bar" }),
  );
  const set = (v: number | undefined) => {
    el.classList.toggle("is-indeterminate", v === undefined);
    el.style.setProperty("--p", String(v ?? 0));
    if (v === undefined) el.removeAttribute("aria-valuenow");
    else el.setAttribute("aria-valuenow", String(Math.round(v)));
  };
  set(value);
  return { el, set };
}

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  label: string;
  onInput?: (v: number) => void;
  onCommit?: (v: number) => void;
}
export interface SliderHandle {
  el: HTMLSpanElement;
  set(v: number): void;
}
/** Same markup as <Slider> (Radix structure), with pointer drag and the slider keys (arrows, Home, End, Page keys). */
export function slider(o: SliderOptions): SliderHandle {
  const range = h("span", { class: "lm-slider__range" });
  const thumb = h("span", { class: "lm-slider__thumb", role: "slider", tabindex: 0, "aria-label": o.label, "aria-valuemin": o.min, "aria-valuemax": o.max, "aria-orientation": "horizontal" });
  const thumbWrap = h("span", { style: "position:absolute;transform:translateX(-50%)" }, thumb);
  const track = h("span", { class: "lm-slider__track" }, range);
  const el = h("span", { class: "lm-slider", dir: "ltr" }, track, thumbWrap);
  let v = o.value;
  const snap = (x: number) => Math.min(o.max, Math.max(o.min, Math.round((x - o.min) / o.step) * o.step + o.min));
  const paint = () => {
    const p = ((v - o.min) / (o.max - o.min)) * 100;
    range.style.left = "0";
    range.style.right = `${100 - p}%`;
    thumbWrap.style.left = `calc(${p}% + ${(0.5 - p / 100) * 14}px)`;
    thumb.setAttribute("aria-valuenow", String(+v.toFixed(3)));
  };
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    return snap(o.min + ((e.clientX - r.left) / r.width) * (o.max - o.min));
  };
  let dragging = false;
  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    v = at(e);
    paint();
    o.onInput?.(v);
    thumb.focus({ preventScroll: true });
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    v = at(e);
    paint();
    o.onInput?.(v);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    o.onCommit?.(v);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  thumb.addEventListener("keydown", (e) => {
    const big = Math.max(o.step, (o.max - o.min) / 10);
    const d: Record<string, number> = { ArrowRight: o.step, ArrowUp: o.step, ArrowLeft: -o.step, ArrowDown: -o.step, PageUp: big, PageDown: -big };
    let next = v;
    if (e.key in d) next = snap(v + d[e.key]!);
    else if (e.key === "Home") next = o.min;
    else if (e.key === "End") next = o.max;
    else return;
    e.preventDefault();
    e.stopPropagation();
    v = next;
    paint();
    o.onInput?.(v);
    o.onCommit?.(v);
  });
  paint();
  return {
    el,
    set(x) {
      v = snap(x);
      paint();
    },
  };
}

export interface SegmentedOptions {
  items: { id: string; label: string }[];
  value: string;
  label: string;
  onChange: (id: string) => void;
  variant?: "pill" | "settings";
}
export interface SegmentedHandle {
  el: HTMLDivElement;
  set(id: string): void;
}
/** Same markup as <Segmented> (radiogroup, roving tabindex, arrow keys). */
export function segmented(o: SegmentedOptions): SegmentedHandle {
  const el = h("div", { role: "radiogroup", "aria-label": o.label, class: cx("lm-seg", o.variant === "pill" && "lm-seg--pill") });
  const set = (id: string) => {
    for (const b of btns) {
      const on = b.dataset.id === id;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (id: string) => {
    set(id);
    o.onChange(id);
  };
  const btns = o.items.map((it) => h("button", { type: "button", role: "radio", class: "lm-seg__opt", "data-id": it.id, on: { click: () => choose(it.id) } }, it.label));
  el.append(...btns);
  el.addEventListener("keydown", (e) => {
    const root = el.getRootNode() as Document | ShadowRoot;
    const i = btns.findIndex((b) => b === root.activeElement);
    const n = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : -2;
    if (n === -2 || i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b = btns[(n + btns.length) % btns.length]!;
    b.focus();
    choose(b.dataset.id!);
  });
  set(o.value);
  return { el, set };
}

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
    const n = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -2;
    if (n === -2) return;
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
