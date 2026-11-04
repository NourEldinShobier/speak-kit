import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The one place that decides how a SpeakKit window is isolated: sandboxed renderer with only the preload bridge, no new
 * windows, no navigation away from the page it was given, no permissions (camera, microphone, location, notifications and
 * the rest are denied; clipboard reads are denied to pages; the app shows notifications from the main process). Every window of the app
 * is created through here.
 */
export function createSecureWindow(options: BrowserWindowConstructorOptions, onLoaded: (w: BrowserWindow) => void): BrowserWindow {
  const w = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      ...options.webPreferences,
    },
  });
  const { session } = w.webContents;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("did-finish-load", () => onLoaded(w));
  return w;
}
