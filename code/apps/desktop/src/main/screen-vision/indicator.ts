import { screen } from "electron";
import { createSecureWindow } from "../secure-window";
import type { Indicator } from "./look";
import { keepProtected } from "./platform";

/** The notice stays this long after the picture is taken, so it is seen even when the look is quick. */
const LINGER_MS = 1500;
const WIDTH = 240;
const HEIGHT = 44;

// Logical properties only (check-css); the page is outside the app's stylesheet, so colours are literal.
const PAGE = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html{background:transparent;font:600 14px system-ui,sans-serif;color:rgb(255 255 255)}
body{margin:0;box-sizing:border-box;block-size:100vh;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:22px;background:rgb(24 24 27 / .92)}
body::before{content:"";inline-size:10px;block-size:10px;border-radius:5px;background:rgb(240 110 110);animation:pulse 1s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){body::before{animation:none}}
</style><body role="status">Looking at your screen</body>`;

const PAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;

/**
 * "Looking at your screen": a small window on top of everything that ignores the mouse and cannot take focus, and that is itself kept out of the
 * capture. Created for a look and destroyed after it, so no window stays alive between looks.
 */
export function createIndicator(): Indicator {
  let w: ReturnType<typeof createSecureWindow> | undefined;
  let gone: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    clearTimeout(gone);
    if (w && !w.isDestroyed()) w.destroy();
    w = undefined;
  };
  return {
    show() {
      close();
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const win = (w = createSecureWindow(
        {
          width: WIDTH,
          height: HEIGHT,
          x: Math.round(area.x + (area.width - WIDTH) / 2),
          y: area.y + 16,
          show: false,
          frame: false,
          transparent: true,
          focusable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          hasShadow: false,
          resizable: false,
          backgroundColor: "#00000000",
          webPreferences: { backgroundThrottling: false, preload: "" },
        },
        (loaded) => loaded.showInactive(),
      ));
      keepProtected.add(win);
      win.setContentProtection(true);
      win.setAlwaysOnTop(true, "screen-saver");
      win.setIgnoreMouseEvents(true);
      win.loadURL(PAGE_URL).catch(close);
    },
    hide() {
      clearTimeout(gone);
      gone = setTimeout(close, LINGER_MS);
    },
  };
}
