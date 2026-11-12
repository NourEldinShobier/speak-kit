import { app, type BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_EVENT, UI_EVENT, type AppState, type UiEvent } from "../shared/ipc";
import type { Config } from "../shared/schemas";
import { closeOutcome } from "../shared/settings/behaviour";
import { appIcon } from "./icon";
import { createSecureWindow } from "./secure-window";
import { appBackground, setupBackground, titleBarSymbol } from "./window-colors";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLE = "Speak Kit";
/** Window hidden this long (ms): destroy it. 0 disables. */
const HIDE_DESTROY_MS = Number(process.env.SPEAKKIT_DESTROY_MS ?? 30_000);

interface MainWindowEvents {
  /** The window became visible again (shown or restored). */
  onVisible(): void;
  /** The window was hidden or minimized: nothing should poll for it. */
  onHidden(): void;
  /** Something is still running (an export or a reading) that a quit would lose. */
  busy(): boolean;
  /** The window was destroyed to free memory (not by a quit). */
  onReleased?(): void;
}

/**
 * The main app window. Closing hides it to the tray; after HIDE_DESTROY_MS hidden it is destroyed to free the renderer, and the
 * next show() builds it again. It owns the quitting flag, because only a real quit may let the window close.
 */
export class MainWindow {
  quitting = false;
  #win: BrowserWindow | null = null;
  #pendingUi: UiEvent[] = [];
  #config: Config;
  #events: MainWindowEvents;

  constructor(config: Config, events: MainWindowEvents) {
    this.#config = config;
    this.#events = events;
  }

  get window(): BrowserWindow | null {
    return this.#win && !this.#win.isDestroyed() ? this.#win : null;
  }

  isVisible(): boolean {
    const w = this.window;
    return !!w && w.isVisible() && !w.isMinimized();
  }

  isFocused(): boolean {
    return !!this.window?.isFocused();
  }

  /** Is this webContents the main window's? */
  owns(c: Electron.WebContents): boolean {
    return this.window?.webContents === c;
  }

  /** A hidden or minimized window is skipped; it is sent the state when it shows again. */
  sendState(state: AppState): void {
    if (this.isVisible()) this.window?.webContents.send(STATE_EVENT, state);
  }

  sendUi(e: UiEvent): void {
    const w = this.window;
    if (w && !w.webContents.isLoading()) w.webContents.send(UI_EVENT, e);
    else this.#pendingUi.push(e);
  }

  show(): void {
    void app.dock?.show(); // macOS: the Dock icon comes back with the window (undefined elsewhere)
    const w = this.window;
    if (!w) return this.create(false);
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  hide(): void {
    this.window?.hide();
    app.dock?.hide(); // macOS: hidden to the menu bar, no Dock icon until the window is shown again
  }

  /** Setup is a fixed 960x680 window; after setup the app window is 1280x800 and resizable. */
  applyMode(first = false): void {
    const w = this.window;
    if (!w) return;
    if (process.platform !== "darwin") w.setTitleBarOverlay(this.#overlay()); // macOS keeps its traffic lights
    w.setBackgroundColor(this.#background());
    if (this.#config.setupDone) {
      w.setMinimumSize(960, 640);
      w.setResizable(true);
      if (!first) {
        w.setContentSize(1280, 800);
        w.center();
      }
    } else {
      w.setMinimumSize(960, 680);
      w.setResizable(false);
      w.setContentSize(960, 680);
    }
  }

  create(hidden: boolean): void {
    const done = this.#config.setupDone;
    const w = (this.#win = createSecureWindow(
      {
        useContentSize: true,
        width: done ? 1280 : 960,
        height: done ? 800 : 680,
        title: TITLE,
        show: false,
        backgroundColor: this.#background(),
        icon: appIcon(),
        titleBarStyle: "hidden",
        ...(process.platform === "darwin" ? { trafficLightPosition: { x: 16, y: 14 } } : { titleBarOverlay: this.#overlay() }),
        webPreferences: { backgroundThrottling: true }, // hidden window: timers and rendering are throttled by Chromium
      },
      (loaded) => {
        for (const e of this.#pendingUi.splice(0)) loaded.webContents.send(UI_EVENT, e);
      },
    ));
    this.applyMode(true);
    if (hidden) app.dock?.hide(); // launched with --hidden: menu bar only
    w.once("ready-to-show", () => {
      if (!hidden) w.show();
    });
    // Hidden to the tray for a while: drop the renderer and GPU memory (about 200 MB); show() rebuilds it in a moment.
    let destroyTimer: NodeJS.Timeout | undefined;
    w.on("show", () => {
      clearTimeout(destroyTimer);
      this.#events.onVisible();
    });
    w.on("restore", () => this.#events.onVisible());
    w.on("hide", () => {
      this.#events.onHidden();
      const delay = this.#config.engines.releaseOnClose ? 0 : HIDE_DESTROY_MS; // the setting asks for the memory back at once
      if (delay > 0 || this.#config.engines.releaseOnClose) destroyTimer = setTimeout(() => !w.isDestroyed() && !w.isVisible() && w.destroy(), delay);
    });
    w.on("minimize", () => this.#events.onHidden());
    // Closing hides to the tray; only Quit (tray menu or app.quit) really exits.
    w.on("close", (e) => this.#onClose(e));
    w.on("closed", () => {
      if (this.#win === w) this.#win = null;
      if (!this.quitting) this.#events.onReleased?.();
    });
    void w.loadFile(path.join(here, "../renderer/index.html"));
  }

  #onClose(e: { preventDefault(): void }): void {
    if (this.quitting) return;
    e.preventDefault();
    const outcome = closeOutcome(this.#config, this.#events.busy());
    if (outcome === "confirm-quit") {
      this.sendUi({ type: "confirm-quit" }); // the same dialog the tray Quit opens; the window stays open meanwhile
      return;
    }
    if (outcome === "quit") {
      setImmediate(() => this.quit()); // quitting inside the close event is ignored for the window that is closing
      return;
    }
    this.hide();
  }

  /** Really quit: lets the window close, then exits the app. */
  quit(): void {
    this.quitting = true;
    app.quit();
  }

  /** White while setup runs (no grey flash), the window grey afterwards. */
  #background() {
    return this.#config.setupDone ? appBackground() : setupBackground();
  }

  #overlay() {
    return {
      color: "#00000000",
      symbolColor: titleBarSymbol(),
      height: this.#config.setupDone ? 38 : 32, // shell title bar 38 (--bar-h), setup window 32
    };
  }
}
