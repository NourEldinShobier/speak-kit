import { screen } from "electron";
import type { PauseRules } from "../../shared/dictation/settings";
import { pausedFor } from "./pause-rules";
import type { ForegroundInfo } from "./types";

interface Deps {
  /** The rules in force, or undefined while dictation is off. */
  rules(): PauseRules | undefined;
  foreground(): ForegroundInfo | null;
  /** The automatic pause switched on or off. */
  changed(on: boolean): void;
}

/** A program is full screen when its window covers the whole display it is on. */
export function isFullscreen(b: NonNullable<ForegroundInfo["bounds"]>, area: { x: number; y: number; width: number; height: number }): boolean {
  return b.width >= area.width && b.height >= area.height && b.x <= area.x && b.y <= area.y;
}

type Rect = { x: number; y: number; width: number; height: number };
interface ScreenApi {
  screenToDipRect(window: null, rect: Rect): Rect;
  getDisplayMatching(rect: Rect): { bounds: Rect };
}

/** The window rectangle comes in physical pixels, the display bounds in DIPs: convert first, or every maximized window passes as full screen above 100% scaling. */
export function coversDisplay(bounds: Rect, api: ScreenApi): boolean {
  const dip = api.screenToDipRect(null, bounds);
  return isFullscreen(dip, api.getDisplayMatching(dip).bounds);
}

/** Polls the program in front once a second while a pause rule is on, and says when the answer changes. Returns the stop function. */
export function watchPauseRules(d: Deps): () => void {
  let paused = false;
  const check = () => {
    const rules = d.rules();
    const fg = d.foreground();
    const now = !!rules && pausedFor(rules, fg && { exe: fg.exe, fullscreen: !!fg.bounds && coversDisplay(fg.bounds, screen) });
    if (now === paused) return;
    paused = now;
    d.changed(now);
  };
  const timer = setInterval(check, 1000);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    if (paused) {
      paused = false;
      d.changed(false);
    }
  };
}
