import { button, h, popoverSurface, slider } from "@speakkit/ui/vanilla";
import { speedLabel } from "../../shared/format";

const SPEED_PRESETS = [0.5, 1, 1.2, 1.5, 2, 3];

interface SpeedPopoverOptions {
  /** current speed, read when a preset is marked */
  speed(): number;
  /** user chose a speed (slider release, preset, reset) */
  onSet(v: number): void;
}

/** Speed popover (B15): slider 0.5x to 3x, preset buttons, reset. Lumen popover surface, slider and toggle buttons. */
export function speedPopover(o: SpeedPopoverOptions): HTMLElement {
  const label = h("output", { class: "sk-pop-val", "aria-live": "polite" }, speedLabel(o.speed()));
  const sl = slider({
    min: 0.5, max: 3, step: 0.05, value: o.speed(), label: "Speed",
    onInput: (v) => { label.textContent = speedLabel(v); },
    onCommit: (v) => { set(v); },
  });
  const presets = SPEED_PRESETS.map((v) => {
    const b = h("button", { type: "button", class: "lm-btn lm-btn--toggle", "aria-label": `${speedLabel(v)} speed`, "data-sk": `speed-${v}`, on: { click: () => { sl.set(v); set(v); } } }, speedLabel(v));
    return b;
  });
  const mark = () => presets.forEach((b, i) => b.setAttribute("aria-pressed", String(Math.abs(SPEED_PRESETS[i]! - cur) < 0.001)));
  let cur = o.speed();
  const set = (v: number) => {
    cur = v;
    label.textContent = speedLabel(v);
    o.onSet(v);
    mark();
  };
  mark();
  const reset = button({ variant: "ghost", size: "sm", iconLeft: "refresh", label: "Reset to 1x", onClick: () => { sl.set(1); set(1); } });
  reset.dataset.sk = "speed-reset";
  return popoverSurface(
    "Speed",
    h("div", { class: "sk-pop-row" }, h("div", { class: "sk-grow" }, sl.el, h("div", { class: "sk-pop-scale" }, h("span", null, "0.5x"), h("span", null, "3x"))), label),
    h("div", { class: "sk-pop-presets" }, ...presets),
    h("div", { class: "sk-pop-foot" }, reset),
  );
}
