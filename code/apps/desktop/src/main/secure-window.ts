import { BrowserWindow, type BrowserWindowConstructorOptions, type Session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const guarded = new WeakSet<Session>();

/** Windows share the default session, so the handlers are set once per session. No page gets any permission. */
function guardSession(session: Session) {
  if (guarded.has(session)) return;
  guarded.add(session);
  session.setPermissionRequestHandler((...[, , callback]) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

/**
 * The one place that decides how a SpeakKit window is isolated: sandboxed renderer with only the preload bridge, no new
 * windows, no navigation away from the page it was given, no permissions (microphone, camera, location,
 * notifications and the rest are denied; clipboard reads are denied to pages; the app shows notifications from the main process). Every window of the app
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
  guardSession(session);
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("did-finish-load", () => onLoaded(w));
  return w;
}
