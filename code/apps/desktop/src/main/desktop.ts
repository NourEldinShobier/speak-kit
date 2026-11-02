import type { BrowserWindow } from "electron";
import path from "node:path";
import type { Api } from "../shared/ipc";
import type { ConfigPatch } from "../shared/schemas";
import type { ShortcutId } from "../shared/shortcuts";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { Ctx } from "./context";
import { setupClipboardPrompt } from "./desktop-clipboard";
import { desktopTestHook } from "./desktop-test-hook";
import { createDesktopToasts, engineAnnouncer } from "./desktop-toasts";
import { setupShortcuts } from "./desktop-shortcuts";
import { engineHandlers } from "./engines";
import { createExports } from "./export/service";
import { installExtension } from "./extension";
import { createReading } from "./reader/service";
import { setupTray } from "./desktop-tray";
import { createUpdates } from "./updates-service";
import { fakeUpdater } from "./updates-fake";

interface DesktopOptions {
  parent: () => BrowserWindow | null;
  /** Directory of the bundled main-process files (mp3-worker.js sits next to index.js). */
  distDir: string;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
  /** The test hook (SPEAKKIT_TEST): shortcuts and toasts are simulated instead of touching the OS. */
  test: boolean;
  /** Version the fake updater announces (tests only; see test-env.ts). */
  fakeUpdate?: string;
}

/**
 * Everything beyond the server and the main window: global shortcuts, reading and the mini player, the clipboard prompt, toasts,
 * exports, updates and the tray. `handlers` are the IPC methods these features add.
 */
export function setupDesktop(ctx: Ctx, o: DesktopOptions) {
  const { toasts, shown: shownToasts } = createDesktopToasts(ctx, o.test);

  // ---- reading, exports, updates ----
  const reading = createReading(ctx, toasts, () => tray.refresh());
  const exports = createExports(ctx, toasts, { parent: o.parent, workerFile: new URL("./mp3-worker.js", `file://${path.resolve(o.distDir)}/`), onChange: () => tray.refresh() });
  let installedByTest = 0;
  // Restart now: what is running stops first; quitAndInstall then quits the app itself.
  const stopWork = () => {
    reading.controller.command({ type: "stop" });
    exports.dispose();
  };
  const updates = createUpdates(ctx, toasts, () => tray.refresh(), stopWork, __TEST_CODE__ && o.fakeUpdate ? () => fakeUpdater(o.fakeUpdate!, () => void installedByTest++) : undefined);

  // ---- global shortcuts ----
  const actions: Record<ShortcutId, () => void> = {
    "read-selection": () => void reading.readSelection(),
    "play-pause": () => reading.controller.command({ type: "toggle" }),
    stop: () => reading.controller.command({ type: "stop" }),
    "read-clipboard": () => void reading.readClipboard(),
  };
  const shortcuts = setupShortcuts(ctx, actions, o.test);

  const announceEngine = engineAnnouncer(ctx, toasts);
  const clipboardPrompt = setupClipboardPrompt(ctx, toasts, reading);
  const tray = setupTray(ctx, { reading, exports, updates, requestQuit: o.requestQuit, retryEngine: o.retryEngine });
  ctx.state.reader = IDLE_READER;
  ctx.state.update ??= UPDATE_UNSUPPORTED;

  const handlers = {
    ...engineHandlers(ctx),
    ...exports.handlers,
    ...updates.handlers,
    ...shortcuts.handlers,
    reader: async (cmd) => reading.command(cmd),
    readClipboard: async () => reading.readClipboard(),
    readerStarted: async (epoch, index) => reading.started(epoch, index),
    readerDone: async (epoch, index) => reading.done(epoch, index),
    installExtension: () => installExtension(!o.test),
  } satisfies Partial<Api>;

  return {
    handlers,
    /** Called by the IPC layer: is this webContents one of our small windows? */
    ownsWindow: (c: Electron.WebContents) => reading.owns(c) || tray.owns(c),
    /** Reacts to a Settings change. */
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.clipboardPrompt !== undefined) clipboardPrompt.sync();
      if (patch.doNotDisturb !== undefined) ctx.publish();
    },
    onEngineState: announceEngine,
    runningWork: () => ({ reading: ctx.state.reader.status === "playing" || ctx.state.reader.status === "preparing", exports: exports.runningCount() }),
    refreshTray: () => tray.refresh(),
    dispose: () => {
      clipboardPrompt.stop();
      shortcuts.unregisterAll();
      reading.dispose();
      exports.dispose();
      updates.dispose();
      tray.dispose();
    },
    testHook: () => desktopTestHook({ shortcuts, shownToasts, tray, reading, installs: () => installedByTest }),
  };
}
