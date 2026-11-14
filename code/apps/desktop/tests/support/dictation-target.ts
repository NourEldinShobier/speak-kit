import { app, BrowserWindow, Menu } from "electron";
import { loadWin32 } from "../../src/main/dictation/windows/native";

/** A stand-in for any program the user dictates into: its own process, one window, one text field, and a log of the keys it received. */
const PAGE = `<!doctype html><meta charset="utf-8"><title>Dictation target</title>
<textarea id="t" autofocus style="inline-size:90%;block-size:70vh"></textarea>
<script>window.keys = []; addEventListener("keydown", (e) => keys.push({ code: e.code, key: e.key, shift: e.shiftKey }), true);</script>`;

const VK_MENU = 0x12;

app.on("window-all-closed", () => app.quit());
// Playwright cannot attach to an app whose main module is still waiting for ready at its top level.
void app.whenReady().then(async () => {
  // Without a menu a tap on Alt (used to take the foreground) would not open one.
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 640, height: 320, show: true });
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
    pid: process.pid,
  };
});
