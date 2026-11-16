import type { BrowserWindow } from "electron";
import { createSecureWindow } from "../secure-window";

/** The microphone is the one permission any window of the app is given, and only this window gets it, for audio only. */
export interface RecorderWindowOptions {
  page: string;
  /** The session the window lives in; each microphone page needs its own, because permission handlers belong to the session. */
  partition?: string;
  /** Asked at every request, so a test (or a future setting) can switch the microphone off without a new window. */
  micAllowed(): boolean;
}

/**
 * A window nobody sees that only runs the recording page. It has a session of its own (partition), because permission handlers belong to the session
 * and the app's other windows share the default one, where every permission stays denied. Camera and screen capture requests from this page are denied too.
 */
export function openRecorderWindow({ page, micAllowed, partition = "speakkit-dictation-recorder" }: RecorderWindowOptions): BrowserWindow {
  const w = createSecureWindow({ show: false, width: 320, height: 200, webPreferences: { partition, backgroundThrottling: false } }, () => {});
  const { session } = w.webContents;
  const id = w.webContents.id;
  const audioOnly = (kinds: readonly string[] | undefined) => !!kinds && kinds.length > 0 && kinds.every((k) => k === "audio");
  session.setPermissionRequestHandler((...[contents, permission, callback, details]) => {
    callback(contents.id === id && permission === "media" && audioOnly((details as { mediaTypes?: string[] }).mediaTypes) && micAllowed());
  });
  session.setPermissionCheckHandler(
    (...[contents, permission, , details]) => !!contents && contents.id === id && permission === "media" && (details as { mediaType?: string }).mediaType === "audio" && micAllowed(),
  );
  w.loadURL(page).catch(() => {
    // A page that cannot load never signals ready; the host then drops the window and the first recording reports the microphone as failed.
  });
  return w;
}

/** What the recorder host needs of its window: the page's web contents and a safe destroy. */
export const recorderHandle = (w: BrowserWindow) => ({
  contents: w.webContents,
  destroy: () => !w.isDestroyed() && w.destroy(),
  get destroyed() {
    return w.isDestroyed();
  },
});
