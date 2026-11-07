import { ICON_DATA, iconAttrs, type IconName } from "../icons";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "g", "clipPath"]);

export type Child = Node | string | number | false | null | undefined;
export type Props = Record<string, unknown> & {
  class?: string | undefined;
  style?: string | undefined;
  on?: Record<string, (e: Event) => void> | undefined;
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

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Inline SVG for an outline icon; stroke is 1.5px on screen at any size (see styles.css). */
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

/** Index a roving-focus key moves to (arrows in `arrows` step by one, Home and End jump), or undefined for any other key. */
export function rovingIndex(key: string, i: number, len: number, arrows: readonly string[]): number | undefined {
  const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (arrows.includes(key)) return i + step[key]!;
  if (key === "Home") return 0;
  if (key === "End") return len - 1;
  return undefined;
}
