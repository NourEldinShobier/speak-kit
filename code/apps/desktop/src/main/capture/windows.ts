import { BrowserWindow, screen, type Rectangle } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CAPSULE_EVENT, OVERLAY_EVENT } from "../../shared/capture/channels";
import type { CapsuleState } from "../../shared/capture/capsule";
import type { OverlayView } from "../../shared/capture/contract";
import { createSecureWindow } from "../secure-window";
import type { RecorderPage } from "./recorder-host";

/** Loads a page; resolves true when it finished loading, false when it could not (the window is then gone). */
function loadedPage(w: BrowserWindow, page: string): Promise<boolean> {
  return new Promise((resolve) => {
    w.webContents.once("did-finish-load", () => resolve(true));
    w.loadURL(page).catch(() => {
      if (!w.isDestroyed()) w.destroy();
      resolve(false);
    });
  });
}

/** The pages of the capture windows sit next to the app page in dist/renderer. */
export const capturePage = (distDir: string, name: string) => pathToFileURL(path.join(distDir, "../renderer", `${name}.html`)).href;

/** Windows that must never be in a recording: the capture sees through them to what is below (SetWindowDisplayAffinity on Windows, sharing type none on macOS). */
const always = new WeakSet<BrowserWindow>();

export function protect(w: BrowserWindow): BrowserWindow {
  always.add(w);
  w.setContentProtection(true);
  return w;
}

/** True for the windows that are never in a capture, also while no recording runs. */
export const isProtected = (w: BrowserWindow): boolean => always.has(w);

/**
 * The hidden window of the recorder. It has a session of its own, because permission handlers belong to the session: this one may use the microphone
 * and the screen (to record), and the app's other windows share a session where every permission stays denied.
 */
export function openRecorderWindow(page: string, micAllowed: () => boolean): RecorderPage {
  const w = createSecureWindow({ show: false, width: 320, height: 200, webPreferences: { partition: "speakkit-capture-recorder", backgroundThrottling: false } }, () => {});
  const { session } = w.webContents;
  const id = w.webContents.id;
  type Details = { mediaTypes?: string[]; mediaType?: string };
  session.setPermissionRequestHandler((...[contents, permission, callback, details]) => {
    const kinds = (details as Details).mediaTypes ?? [];
    callback(contents.id === id && permission === "media" && (!kinds.includes("audio") || micAllowed()));
  });
  session.setPermissionCheckHandler(
    (...[contents, permission, , details]) => !!contents && contents.id === id && permission === "media" && ((details as Details).mediaType !== "audio" || micAllowed()),
  );
  w.loadURL(page).catch(() => {
    // A page that cannot load never signals ready; the host then drops the window and the capture fails with a plain notice.
  });
  return {
    contents: w.webContents,
    destroy: () => !w.isDestroyed() && w.destroy(),
    get destroyed() {
      return w.isDestroyed();
    },
  };
}

export interface OverlayHandle {
  window: BrowserWindow;
  show(view: OverlayView): Promise<void>;
  close(): void;
}

/** A transparent window over one display, for the picker or the ink layer. The picker takes the keyboard (Esc) and is not part of any recording. */
export function openOverlayWindow(page: string, bounds: Rectangle, inkLayer = false): OverlayHandle {
  const made = createSecureWindow(
    {
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      backgroundColor: "#00000000",
    },
    () => {},
  );
  // The ink layer is the one window that belongs in a recording: it is what the person draws.
  const w = inkLayer ? made : protect(made);
  w.setAlwaysOnTop(true, "screen-saver");
  w.setBounds(bounds);
  const loaded = loadedPage(w, page);
  return {
    window: w,
    async show(view) {
      if (!(await loaded) || w.isDestroyed()) return;
      w.webContents.send(OVERLAY_EVENT, view);
      // The picker takes the keyboard (Esc); the ink layer must not, so the program being drawn over keeps its focus.
      if (view.mode === "ink") w.showInactive();
      else {
        w.show();
        w.focus();
      }
    },
    close: () => !w.isDestroyed() && w.destroy(),
  };
}

export interface CapsuleHandle {
  window: BrowserWindow;
  push(state: CapsuleState | null): Promise<void>;
  moveTo(displayBounds: Rectangle): void;
  close(): void;
}

const CAPSULE = { width: 640, height: 120 };

/** The capsule: small, always on top, never takes focus, and not in recordings. Transparent area around the pill ignores the mouse. */
export function openCapsuleWindow(page: string, displayBounds: Rectangle): CapsuleHandle {
  const w = protect(
    createSecureWindow(
      { ...CAPSULE, show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, resizable: false, backgroundColor: "#00000000" },
      () => {},
    ),
  );
  w.setAlwaysOnTop(true, "screen-saver");
  w.setIgnoreMouseEvents(true, { forward: true });
  const place = (b: Rectangle) => w.setPosition(Math.round(b.x + (b.width - CAPSULE.width) / 2), Math.round(b.y + b.height - CAPSULE.height - 32));
  place(displayBounds);
  const loaded = loadedPage(w, page);
  return {
    window: w,
    async push(state) {
      if (!(await loaded) || w.isDestroyed()) return;
      w.webContents.send(CAPSULE_EVENT, state);
      if (state) w.showInactive();
      else w.hide();
    },
    moveTo: place,
    close: () => !w.isDestroyed() && w.destroy(),
  };
}

/** The display a point is on, as the rectangle the overlay and the capsule cover. */
export const displayBoundsAt = (p: { x: number; y: number }): Rectangle => screen.getDisplayNearestPoint(p).bounds;
