import { app, BrowserWindow, Menu } from "electron";
import { loadWin32 } from "../../src/main/dictation/windows/native";

/** A stand-in for any program the user is looking at: its own process, one window with a title and large black text on white. */
const PAGE = `<!doctype html><meta charset="utf-8"><title>SKVISION Target</title>
<body style="margin:0;background:#fff;color:#000;font:34px Segoe UI,sans-serif;padding:24px;line-height:1.5">
<div>Invoice 48213 total 129.50 EUR</div>
<div>Order SpeakKit-7731 shipped to Berlin</div>
<div>The quick brown fox jumps over the lazy dog</div>`;

const VK_MENU = 0x12;

app.on("window-all-closed", () => app.quit());
// Playwright cannot attach to an app whose main module is still waiting for ready at its top level.
void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 900, height: 420, x: 120, y: 120, show: true });
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
  const win32 = await loadWin32();
  const alt = (up: boolean) => ({ type: 1 as const, u: { ki: { wVk: VK_MENU, wScan: 0, dwFlags: up ? 2 : 0, time: 0 as const, dwExtraInfo: 0 } } });
  // Windows lets a process take the foreground only soon after it injected or received input, so the window raises itself the way the user's click would.
  (globalThis as Record<string, unknown>).__target = {
    raise() {
      win32.sendInput([alt(false), alt(true)]);
      app.focus({ steal: true });
      w.show();
      w.focus();
    },
  };
});
