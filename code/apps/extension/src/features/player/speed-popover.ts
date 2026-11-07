import { button, h, popoverSurface, segmented, slider } from "@speakkit/ui/vanilla";
import { speedLabel } from "../../shared/format";

const SPEED_PRESETS = [0.5, 1, 1.2, 1.5, 2, 3];

interface SpeedPopoverOptions {
  /** current speed, read when a preset is marked */
  speed(): number;
  /** user chose a speed (slider release, preset, reset) */
  onSet(v: number): void;
}

/** The preset track: the preset equal to the speed is selected, between presets none is. Each button keeps its data-sk hook. */
function presetTrack(onPick: (v: number) => void) {
  const track = segmented({ label: "Speed presets", items: SPEED_PRESETS.map((v) => ({ id: String(v), label: speedLabel(v) })), value: "", onChange: (id) => onPick(Number(id)) });
  track.el.classList.add("sk-pop-presets");
  track.el.querySelectorAll<HTMLElement>("button").forEach((b) => (b.dataset.sk = `speed-${b.dataset.id}`));
  const mark = (speed: number) => {
    const on = SPEED_PRESETS.find((v) => Math.abs(v - speed) < 0.001);
    track.set(on === undefined ? "" : String(on));
    if (on === undefined) track.el.querySelector("button")!.tabIndex = 0; // with none selected the group stays reachable by Tab
  };
  return { el: track.el, mark };
}

/** Speed popover: "Speed" and the value on one row, a full-width slider with 0.5x and 3x under its ends, presets in a segmented track, reset. */
export function speedPopover(o: SpeedPopoverOptions): HTMLElement {
  const label = h("output", { class: "sk-pop-val", "aria-live": "polite" }, speedLabel(o.speed()));
  const sl = slider({ min: 0.5, max: 3, step: 0.05, value: o.speed(), label: "Speed", onInput: (v) => (label.textContent = speedLabel(v)), onCommit: (v) => set(v) });
  const presets = presetTrack((v) => {
    sl.set(v);
    set(v);
  });
  const set = (v: number) => {
    label.textContent = speedLabel(v);
    o.onSet(v);
    presets.mark(v);
  };
  presets.mark(o.speed());
  const reset = button({
    variant: "ghost",
    size: "sm",
    iconLeft: "refresh",
    label: "Reset to 1x",
    onClick: () => {
      sl.set(1);
      set(1);
    },
  });
  reset.dataset.sk = "speed-reset";
  const pop = popoverSurface(
    undefined,
    h("div", { class: "sk-pop-head" }, h("h3", { class: "lm-popover__title" }, "Speed"), label),
    sl.el,
    h("div", { class: "sk-pop-scale" }, h("span", null, "0.5x"), h("span", null, "3x")),
    presets.el,
    h("div", { class: "sk-pop-foot" }, reset),
  );
  pop.setAttribute("aria-label", "Speed");
  pop.classList.add("sk-pop-speed");
  return pop;
}
