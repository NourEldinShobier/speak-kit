import type { HudView } from "../../shared/dictation/contract";
import type { Indicator } from "../../shared/dictation/settings";

/** Space between the pill and the edge of the screen. */
const EDGE = 24;

/** Where the pill goes in a display's work area: centred, at the top or the bottom. */
export function hudPosition(area: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, place: "top" | "bottom"): { x: number; y: number } {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: place === "top" ? area.y + EDGE : area.y + area.height - size.height - EDGE,
  };
}

/**
 * Whether a view is drawn when the indicator is switched off. Off hides the recording, transcribing and ready pills; anything the person has to read or
 * answer (a failure, a message, a button) still shows, because those are not the recording indicator. The skip button of the rewrite is one of them: the
 * cancel key is taken while it shows.
 */
export function drawn(indicator: Indicator, view: HudView): boolean {
  if (indicator !== "off") return true;
  return !(view.kind === "recording" || (view.kind === "transcribing" && !view.skip) || view.kind === "ready" || view.kind === "pasted");
}

/** Whether the pill has a button to click; only then does the HUD window take the mouse, otherwise clicks fall through to the app underneath. */
export const takesClicks = (view: HudView): boolean => (view.kind === "error" && !!view.action) || (view.kind === "transcribing" && !!view.skip);
