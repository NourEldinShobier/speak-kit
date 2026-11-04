import { LOGO_CLIP_ID, LOGO_COLORS, logoVariant } from "../logo";
import type { IconName } from "../icons";
import { cx, h, icon } from "./dom";

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
  const svg = h(
    "svg",
    { viewBox: "0 0 512 512", focusable: "false" },
    h("clipPath", { id: LOGO_CLIP_ID }, h("path", { d: v.clip })),
    h("g", { "clip-path": `url(#${LOGO_CLIP_ID})` }, ...v.pieces.map((p, i) => h("path", { d: p, fill: LOGO_COLORS.pieces[i] }))),
  );
  svg.append(
    h("path", { d: v.hub, fill: LOGO_COLORS.hub }),
    h("path", { d: v.wave, fill: "none", stroke: LOGO_COLORS.wave, "stroke-width": v.waveWidth, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
  return h("span", { class: "lm-logo", style: `--s:${size}`, "aria-hidden": "true" }, svg);
}

/** Initial in a coloured circle (same markup as <Avatar>); tone "accent" uses the brand colour. */
export function avatar(name: string, size = 32, tone: PillTone | "accent" = "neutral"): HTMLSpanElement {
  return h("span", { class: `lm-avatar lm-tone-${tone}`, style: `--s:${size}` }, name.slice(0, 1).toUpperCase());
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
