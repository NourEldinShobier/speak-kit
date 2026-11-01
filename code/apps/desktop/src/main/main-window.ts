import { app, nativeTheme, type BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_EVENT, UI_EVENT, type AppState, type UiEvent } from "../shared/ipc";
import type { Config } from "../shared/schemas";
import { appIcon } from "./icon";
import { createSecureWindow } from "./secure-window";
import { appBackground, titleBarSymbol } from "./window-colors";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLE = "Speak Kit";
/** Window hidden this long (ms): destroy it. 0 disables. */
const HIDE_DESTROY_MS = Number(process.env.SPEAKKIT_DESTROY_MS ?? 30_000);

interface MainWindowEvents {
  /** The window became visible again (shown or restored). */
  onVisible(): void;
  /** The window was hidden or minimized: nothing should poll for it. */
  onHidden(): void;
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
    const w = this.window;
    if (!w) return this.create(false);
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  hide(): void {
    this.window?.hide();
  }

  /** Setup is a fixed 960x680 window; after setup the app window is 1280x800 and resizable. */
  applyMode(first = false): void {
    const w = this.window;
    if (!w) return;
    if (process.platform !== "darwin") w.setTitleBarOverlay(this.#overlay()); // macOS keeps its traffic lights
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
        backgroundColor: appBackground(nativeTheme.shouldUseDarkColors),
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
      if (HIDE_DESTROY_MS > 0) destroyTimer = setTimeout(() => !w.isDestroyed() && !w.isVisible() && w.destroy(), HIDE_DESTROY_MS);
    });
    w.on("minimize", () => this.#events.onHidden());
    // Closing hides to the tray; only Quit (tray menu or app.quit) really exits.
    w.on("close", (e) => {
      if (this.quitting) return;
      e.preventDefault();
      w.hide();
    });
    w.on("closed", () => {
      if (this.#win === w) this.#win = null;
    });
    void w.loadFile(path.join(here, "../renderer/index.html"));
  }

  /** Really quit: lets the window close, then exits the app. */
  quit(): void {
    this.quitting = true;
    app.quit();
  }

  #overlay() {
    return {
      color: "#00000000",
      symbolColor: titleBarSymbol(nativeTheme.shouldUseDarkColors),
      height: this.#config.setupDone ? 40 : 32, // Lumen: shell title bar 40, setup window 32
    };
  }
}
