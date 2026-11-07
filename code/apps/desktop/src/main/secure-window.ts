import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grantPermission } from "./permissions";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The one place that decides how a SpeakKit window is isolated: sandboxed renderer with only the preload bridge, no new
 * windows, no navigation away from the page it was given, no permissions except the microphone for the main window (camera, location,
 * notifications and the rest are denied; clipboard reads are denied to pages; the app shows notifications from the main process). Every window of the app
 * is created through here.
 */
export function createSecureWindow(options: BrowserWindowConstructorOptions, onLoaded: (w: BrowserWindow) => void, { microphone = false }: { microphone?: boolean } = {}): BrowserWindow {
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
  // Only the main window may ask for the microphone, and only for audio from the app's own page (see permissions.ts).
  session.setPermissionRequestHandler((...[, permission, callback, details]) =>
    callback(grantPermission({ permission, mediaTypes: (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? [], url: details?.requestingUrl ?? "", microphoneWindow: microphone })),
  );
  session.setPermissionCheckHandler((...[, permission, , details]) => {
    const mediaType = (details as { mediaType?: string } | undefined)?.mediaType;
    return grantPermission({ permission, mediaTypes: mediaType ? [mediaType] : [], url: details?.requestingUrl ?? "", microphoneWindow: microphone });
  });
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("did-finish-load", () => onLoaded(w));
  return w;
}
