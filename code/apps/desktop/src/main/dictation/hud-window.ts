import { screen } from "electron";
import { createSecureWindow } from "../secure-window";
import type { HudState, HudWindow } from "./hud";

export interface HudWindowOptions {
  /** Page to load. The built-in page draws the states; a custom page reads `data-kind`, `data-tone` and `data-text` on <body> and `--hud-level` on <html>. */
  page?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

// Logical properties only (check-css); colours stay literal because this page is outside the app's stylesheet.
const PAGE = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html{--hud-level:0;background:transparent;font:600 14px system-ui,sans-serif;color:rgb(255 255 255)}
body{margin:0;box-sizing:border-box;block-size:100vh;display:flex;align-items:center;justify-content:center;gap:12px;padding-inline:20px;border-radius:28px;background:rgb(24 24 27 / .9)}
body::before{content:"";display:block;inline-size:calc(16px + 140px * var(--hud-level));block-size:8px;border-radius:4px;background:rgb(255 255 255);transition:inline-size 60ms linear}
body[data-kind=transcribing]::before{inline-size:64px;animation:wait 1s ease-in-out infinite}
body[data-kind=notice]::before{inline-size:8px;background:rgb(120 200 140)}
body[data-kind=notice][data-tone=error]::before{background:rgb(240 110 110)}
body[data-kind=notice]::after{content:attr(data-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes wait{50%{opacity:.35}}
</style><body></body>`;

export const HUD_PAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** The script that puts a state on the page: attributes and one CSS variable, so a page needs no code of its own to show it. */
export function stateScript(state: HudState): string {
  const level = state.kind === "recording" ? clamp01(state.level) : 0;
  const tone = state.kind === "notice" ? state.tone : "";
  const text = state.kind === "notice" ? state.text : "";
  return `(() => {
    document.documentElement.style.setProperty("--hud-level", ${JSON.stringify(String(level))});
    const b = document.body;
    b.dataset.kind = ${JSON.stringify(state.kind)};
    b.dataset.tone = ${JSON.stringify(tone)};
    b.dataset.text = ${JSON.stringify(text)};
  })()`;
}

/**
 * A small always-on-top window that ignores the mouse and cannot take focus: `focusable: false` keeps it from being activated, `showInactive` keeps
 * the foreground window foreground, and the "screen-saver" level keeps it above full-screen windowed apps.
 */
export function openHudWindow({ page = HUD_PAGE_URL, width = 240, height = 56 }: HudWindowOptions = {}): HudWindow {
  let settle!: { resolve(): void; reject(e: unknown): void };
  const ready = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
  const w = createSecureWindow(
    {
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      backgroundColor: "#00000000",
      // The HUD page needs no bridge to the app.
      webPreferences: { backgroundThrottling: false, preload: "" },
    },
    () => settle.resolve(),
  );
  w.setAlwaysOnTop(true, "screen-saver");
  w.setIgnoreMouseEvents(true);
  w.loadURL(page).catch(settle.reject);

  return {
    ready,
    get destroyed() {
      return w.isDestroyed();
    },
    push(state) {
      w.webContents.executeJavaScript(stateScript(state)).catch(() => {
        // The page can be gone by the time the script runs (window destroyed right after a show).
      });
    },
    showInactive() {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      w.setPosition(Math.round(area.x + (area.width - width) / 2), area.y + area.height - height - 24);
      w.showInactive();
    },
    hide: () => w.hide(),
    destroy() {
      if (!w.isDestroyed()) w.destroy();
    },
  };
}
