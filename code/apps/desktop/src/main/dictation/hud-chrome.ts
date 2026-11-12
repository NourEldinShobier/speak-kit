import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

export interface HudChrome {
  /** Extra constructor options for the HUD window on this platform. */
  window: Pick<BrowserWindowConstructorOptions, "type">;
  /** Show on every desktop (Space) and above full-screen apps. */
  allSpaces: boolean;
}

/**
 * macOS needs more than `focusable: false` for a pill that never takes focus: a panel (non-activating) window, and visibility on every Space including
 * full-screen apps. Windows gets that from the always-on-top level alone.
 */
export const hudChrome = (platform: string): HudChrome => (platform === "darwin" ? { window: { type: "panel" }, allSpaces: true } : { window: {}, allSpaces: false });

/** Puts the window above full-screen apps and, on macOS, on every Space; the Dock icon stays (skipTransformProcessType: without it macOS turns the app into an agent app). */
export function raiseAboveEverything(w: Pick<BrowserWindow, "setAlwaysOnTop" | "setVisibleOnAllWorkspaces">, chrome: HudChrome): void {
  w.setAlwaysOnTop(true, "screen-saver");
  if (chrome.allSpaces) w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
}
