import type { IconName } from "../icons";
import { cx, h, icon, rovingIndex } from "./dom";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  label?: string;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  onClick?: (e: Event) => void;
  ariaLabel?: string;
}

const BTN_GLYPH: Record<string, number> = { xs: 12, sm: 14 };
const ICON_GLYPH: Record<number, number> = { 24: 12, 28: 14 };

export function button(o: ButtonOptions = {}): HTMLButtonElement {
  const variant = o.variant ?? "secondary";
  const lead = o.loading ? "loader-2" : o.iconLeft;
  const glyph = BTN_GLYPH[o.size ?? ""] ?? 16;
  return h(
    "button",
    {
      type: "button",
      class: cx("lm-btn", `lm-btn--${variant}`, o.size === "xs" && "lm-btn--xs", o.size === "sm" && "lm-btn--sm", o.size === "xl" && "lm-btn--xl", o.loading && "is-loading"),
      disabled: o.disabled,
      "aria-busy": o.loading ? "true" : undefined,
      "aria-label": o.ariaLabel,
      on: o.onClick ? { click: o.onClick } : undefined,
    },
    lead && icon(lead, glyph, o.loading ? "lm-spin" : undefined),
    o.label,
    o.iconRight && icon(o.iconRight, glyph),
  );
}

export interface IconButtonOptions {
  name: IconName;
  label: string;
  size?: 40 | 36 | 32 | 28 | 24;
  round?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: Event) => void;
  /** extra classes and data attributes (for example data-sk hooks) */
  className?: string;
  data?: Record<string, string>;
}

export function iconButton(o: IconButtonOptions): HTMLButtonElement {
  const size = o.size ?? 36;
  return h(
    "button",
    {
      type: "button",
      class: cx("lm-btn lm-btn--icon", size === 28 && "lm-btn--sm", size === 24 && "lm-btn--xs", size === 40 && "lm-btn--xl", o.round && "lm-btn--round", o.loading && "is-loading", o.className),
      "aria-label": o.label,
      "aria-busy": o.loading ? "true" : undefined,
      disabled: o.disabled,
      on: o.onClick ? { click: o.onClick } : undefined,
      ...Object.fromEntries(Object.entries(o.data ?? {}).map(([k, v]) => [`data-${k}`, v])),
    },
    icon(o.loading ? "loader-2" : o.name, ICON_GLYPH[size] ?? 16, o.loading ? "lm-spin" : undefined),
  );
}

export interface ToggleOptions {
  checked?: boolean;
  disabled?: boolean;
  /** Deprecated, no effect. */
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
      class: "lm-toggle",
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
const snapTo = (x: number, o: SliderOptions) => Math.min(o.max, Math.max(o.min, Math.round((x - o.min) / o.step) * o.step + o.min));

/** Value a slider key moves to (arrows by step, Page keys by a tenth of the range, Home and End to the ends), or undefined for any other key. */
function sliderKeyTarget(key: string, v: number, o: SliderOptions): number | undefined {
  const big = Math.max(o.step, (o.max - o.min) / 10);
  const delta: Record<string, number> = { ArrowRight: o.step, ArrowUp: o.step, ArrowLeft: -o.step, ArrowDown: -o.step, PageUp: big, PageDown: -big };
  if (key in delta) return snapTo(v + delta[key]!, o);
  if (key === "Home") return o.min;
  if (key === "End") return o.max;
  return undefined;
}

/** Same markup as <Slider> (Radix structure), with pointer drag and the slider keys (arrows, Home, End, Page keys). */
export function slider(o: SliderOptions): SliderHandle {
  const range = h("span", { class: "lm-slider__range" });
  const thumb = h("span", { class: "lm-slider__thumb", role: "slider", tabindex: 0, "aria-label": o.label, "aria-valuemin": o.min, "aria-valuemax": o.max, "aria-orientation": "horizontal" });
  const thumbWrap = h("span", { style: "position:absolute;transform:translateX(-50%)" }, thumb);
  const track = h("span", { class: "lm-slider__track" }, range);
  const el = h("span", { class: "lm-slider", dir: "ltr" }, track, thumbWrap);
  let v = o.value;
  const snap = (x: number) => snapTo(x, o);
  const paint = () => {
    const p = ((v - o.min) / (o.max - o.min)) * 100;
    range.style.left = "0";
    range.style.right = `${100 - p}%`;
    thumbWrap.style.left = `calc(${p}% + ${(0.5 - p / 100) * 18}px)`;
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
    const next = sliderKeyTarget(e.key, v, o);
    if (next === undefined) return;
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
  const btns = o.items.map((it) =>
    h("button", { type: "button", role: "radio", class: "lm-seg__opt", "data-id": it.id, on: { click: () => choose(it.id) } }, h("span", { class: "lm-seg__label", "data-label": it.label }, it.label)),
  );
  el.append(...btns);
  el.addEventListener("keydown", (e) => {
    const root = el.getRootNode() as Document | ShadowRoot;
    const i = btns.findIndex((b) => b === root.activeElement);
    const n = rovingIndex(e.key, i, btns.length, ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]);
    if (n === undefined || i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b = btns[(n + btns.length) % btns.length]!;
    b.focus();
    choose(b.dataset.id!);
  });
  set(o.value);
  return { el, set };
}
