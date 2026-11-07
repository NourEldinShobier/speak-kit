import { BrowserWindow, type BrowserWindowConstructorOptions, type Session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grantPermission } from "./permissions";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Ids of the web contents that may use the microphone (the main window). */
const microphoneContents = new Set<number>();
const guarded = new WeakSet<Session>();

/** Windows share the default session, so there is one handler pair per session that looks the requester up; the last window created must not decide for the others. */
function guardSession(session: Session) {
  if (guarded.has(session)) return;
  guarded.add(session);
  // Only the main window may ask for the microphone, and only for audio from the app's own page (see permissions.ts).
  session.setPermissionRequestHandler((...[webContents, permission, callback, details]) =>
    callback(
      grantPermission({
        permission,
        mediaTypes: (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? [],
        url: details?.requestingUrl ?? "",
        microphoneWindow: !!webContents && microphoneContents.has(webContents.id),
      }),
    ),
  );
  session.setPermissionCheckHandler((...[webContents, permission, , details]) => {
    const mediaType = (details as { mediaType?: string } | undefined)?.mediaType;
    return grantPermission({ permission, mediaTypes: mediaType ? [mediaType] : [], url: details?.requestingUrl ?? "", microphoneWindow: !!webContents && microphoneContents.has(webContents.id) });
  });
}

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
  if (microphone) {
    const id = w.webContents.id;
    microphoneContents.add(id);
    w.webContents.once("destroyed", () => microphoneContents.delete(id));
  }
  guardSession(session);
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("did-finish-load", () => onLoaded(w));
  return w;
}
