import { type BrowserWindow, nativeTheme, screen, type BrowserWindowConstructorOptions, type Rectangle } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSecureWindow } from "./secure-window";
import { floatBackground } from "./window-colors";
import { STATE_EVENT, UI_EVENT, type AppState, type UiEvent } from "../shared/ipc";

const here = path.dirname(fileURLToPath(import.meta.url));

type FloatPage = "mini" | "panel";

/**
 * A small frameless window (mini player, tray panel). It exists only while it is in use: opening creates it, closing destroys
 * it, so a hidden SpeakKit holds no renderer for them. Messages sent before the page has loaded wait in a queue.
 */
export class FloatWindow {
  #page: FloatPage;
  #options: BrowserWindowConstructorOptions;
  #win: BrowserWindow | null = null;
  #pending: [string, unknown][] = [];
  #loaded = false;
  #state: () => AppState;

  constructor(page: FloatPage, options: BrowserWindowConstructorOptions, state: () => AppState) {
    this.#page = page;
    this.#options = options;
    this.#state = state;
  }

  get window(): BrowserWindow | null {
    return this.#win && !this.#win.isDestroyed() ? this.#win : null;
  }

  /** Creates the window if needed. `at` places a new window (an open one stays where the user dragged it); `focus` false shows it without taking focus from the app being read. */
  open(at: Rectangle | ((size: { width: number; height: number }) => Rectangle), focus: boolean): BrowserWindow {
    let w = this.window;
    if (!w) {
      this.#loaded = false;
      w = this.#win = createSecureWindow(
        {
          frame: false,
          resizable: false,
          maximizable: false,
          minimizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          show: false,
          backgroundColor: floatBackground(nativeTheme.shouldUseDarkColors),
          ...this.#options,
        },
        (loaded) => {
          this.#loaded = true;
          loaded.webContents.send(STATE_EVENT, this.#state());
          for (const [ch, payload] of this.#pending.splice(0)) loaded.webContents.send(ch, payload);
        },
      );
      w.on("closed", () => (this.#win = null));
      // macOS: a read can start in a full-screen app on another Space; the mini player and the panel must show up there too.
      if (process.platform === "darwin") {
        w.setAlwaysOnTop(true, "floating");
        w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      }
      void w.loadFile(path.join(here, `../renderer/${this.#page}.html`));
      const size = w.getSize();
      w.setBounds(typeof at === "function" ? at({ width: size[0]!, height: size[1]! }) : at);
    }
    if (!w.isVisible()) {
      if (focus) w.show();
      else w.showInactive();
    }
    return w;
  }

  close(): void {
    this.window?.destroy();
    this.#win = null;
    this.#pending = [];
  }

  /** Is this webContents ours? Used to accept IPC calls only from windows the app created. */
  owns(contents: Electron.WebContents): boolean {
    return this.window?.webContents === contents;
  }

  sendState(state: AppState): void {
    this.#send(STATE_EVENT, state);
  }

  sendUi(e: UiEvent): void {
    this.#send(UI_EVENT, e);
  }

  #send(channel: string, payload: unknown) {
    const w = this.window;
    if (!w) return;
    if (this.#loaded) w.webContents.send(channel, payload);
    else if (channel !== STATE_EVENT) this.#pending.push([channel, payload]); // the state is sent in full once loaded
  }
}

/** Bottom-right corner of the primary display's work area, above the taskbar. */
export const cornerOf =
  (margin = 16) =>
  (size: { width: number; height: number }): Rectangle => {
    const wa = screen.getPrimaryDisplay().workArea;
    return { ...size, x: wa.x + wa.width - size.width - margin, y: wa.y + wa.height - size.height - margin };
  };

/** Above (or beside) the tray icon, kept inside the work area of the display that holds it. */
export const aboveTray =
  (tray: Rectangle) =>
  (size: { width: number; height: number }): Rectangle => {
    const wa = screen.getDisplayNearestPoint({ x: tray.x, y: tray.y }).workArea;
    const x = Math.min(Math.max(wa.x + 8, Math.round(tray.x + tray.width / 2 - size.width / 2)), wa.x + wa.width - size.width - 8);
    const above = tray.y - size.height - 12;
    const y = above >= wa.y ? above : Math.min(tray.y + tray.height + 12, wa.y + wa.height - size.height - 8);
    return { ...size, x, y };
  };
