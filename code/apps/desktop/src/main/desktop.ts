import { app, type BrowserWindow } from "electron";
import path from "node:path";
import type { Api } from "../shared/ipc";
import type { ConfigPatch } from "../shared/schemas";
import type { ShortcutId } from "../shared/shortcuts";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { Ctx } from "./context";
import { desktopTestHook } from "./desktop-test-hook";
import { createDesktopToasts, engineAnnouncer } from "./desktop-toasts";
import { setupShortcuts } from "./desktop-shortcuts";
import { engineHandlers } from "./engines";
import { createExports } from "./export/service";
import { installExtension } from "./extension";
import { createReading } from "./reader/service";
import { setupTray } from "./desktop-tray";
import { showTrayIcon } from "../shared/settings/behaviour";
import { createUpdates } from "./updates-service";
import { setupControl } from "./control";
import { setupCapture } from "./capture";
import { registerDictationIpc } from "./dictation/ipc";
import { hotkeyPermissionsReady } from "../shared/permissions/guide";
import { setupPermissions } from "./system/permissions";
import { DictationService, type DictationServiceOptions } from "./dictation/service";
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
  fakeUpdate?: string | undefined;
  /** The app version, for the control server. */
  version: string;
  /** Where dictation keeps its history and models, and its speech worker. */
  dictation: Pick<DictationServiceOptions, "dataDir" | "modelsDir" | "sttWorker" | "micOwner">;
}

const shortcutActions = (reading: ReturnType<typeof createReading>): Record<ShortcutId, () => void> => ({
  "read-selection": () => void reading.readSelection(),
  "play-pause": () => reading.controller.command({ type: "toggle" }),
  stop: () => reading.controller.command({ type: "stop" }),
});

const readerHandlers = (reading: ReturnType<typeof createReading>) =>
  ({
    reader: async (cmd) => reading.command(cmd),
    readerStarted: async (epoch, index) => reading.started(epoch, index),
    readerDone: async (epoch, index) => reading.done(epoch, index),
  }) satisfies Partial<Api>;

// Restart now: what is running stops first; quitAndInstall then quits the app itself.
function stopForRestart(reading: ReturnType<typeof createReading>, exports: ReturnType<typeof createExports>): void {
  reading.controller.command({ type: "stop" });
  exports.dispose();
}

/** Permissions the dictation hotkey needs; the hotkey is retried when they get allowed. */
function watchPermissions(parent: DesktopOptions["parent"], dictation: DictationService): void {
  const permissions = setupPermissions(
    () => parent()?.webContents,
    (s) => void dictation.retryHotkey(hotkeyPermissionsReady(s.states)),
  );
  // Nothing tells the app when a switch is flipped in System Settings: read again when the person comes back to the app.
  app.on("browser-window-focus", permissions.refresh);
}

/**
 * Everything beyond the server and the main window: global shortcuts, reading and the mini player, toasts,
 * exports, updates and the tray. `handlers` are the IPC methods these features add.
 */
export function setupDesktop(ctx: Ctx, o: DesktopOptions) {
  const { toasts, shown: shownToasts } = createDesktopToasts(ctx, o.test);

  const reading = createReading(ctx, toasts, () => tray.refresh());
  const exports = createExports(ctx, toasts, { parent: o.parent, workerFile: new URL("./mp3-worker.js", `file://${path.resolve(o.distDir)}/`), onChange: () => tray.refresh() });
  let installedByTest = 0;
  const stopWork = () => stopForRestart(reading, exports);
  const updates = createUpdates(ctx, toasts, () => tray.refresh(), stopWork, __TEST_CODE__ && o.fakeUpdate ? () => fakeUpdater(o.fakeUpdate!, () => void installedByTest++) : undefined);

  const shortcuts = setupShortcuts(ctx, shortcutActions(reading), o.test);
  // The dictation service reaches the tray only through this callback, so the tray can be built after it.
  const dictation = new DictationService(ctx, { ...o.dictation, distDir: o.distDir, parent: o.parent, test: o.test }, () => tray.refresh());
  const tray = setupTray(ctx, { reading, exports, updates, dictation, requestQuit: o.requestQuit, retryEngine: o.retryEngine });
  ctx.state.reader = IDLE_READER;
  ctx.state.update ??= UPDATE_UNSUPPORTED;

  registerDictationIpc(dictation, (c) => o.parent()?.webContents === c);
  watchPermissions(o.parent, dictation);
  const control = setupControl(ctx, { reading, dictation, dataDir: o.dictation.dataDir, version: o.version });
  const capture = setupCapture(ctx, { dataDir: o.dictation.dataDir, distDir: o.distDir, parent: o.parent, dictation, test: o.test });

  const handlers = {
    ...engineHandlers(ctx),
    ...exports.handlers,
    ...updates.handlers,
    ...shortcuts.handlers,
    ...readerHandlers(reading),
    installExtension: () => installExtension(!o.test),
  } satisfies Partial<Api>;

  return {
    handlers,
    /** Called by the IPC layer: is this webContents our mini player? */
    ownsWindow: (c: Electron.WebContents) => reading.owns(c),
    /** Reacts to a Settings change. */
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.doNotDisturb !== undefined) ctx.publish();
      if (patch.hideTrayIcon !== undefined) tray.setVisible(showTrayIcon(ctx.config));
      control.onConfigPatch(patch);
    },
    onEngineState: engineAnnouncer(ctx, toasts),
    runningWork: () => ({ reading: ctx.state.reader.status === "playing" || ctx.state.reader.status === "preparing", exports: exports.runningCount() }),
    refreshTray: () => tray.refresh(),
    /** A capture that is recording or being saved at quit: resolves when it is saved. Undefined when none is. */
    finishCapture: () => capture.finishForQuit(),
    /** Resolves once the control server is down and its discovery file is gone. */
    dispose: (): Promise<void> => {
      const controlDown = control.dispose();
      shortcuts.unregisterAll();
      reading.dispose();
      exports.dispose();
      updates.dispose();
      tray.dispose();
      void dictation.dispose();
      capture.dispose();
      return controlDown;
    },
    testHook: () => desktopTestHook({ shortcuts, shownToasts, tray, reading, dictation, capture, installs: () => installedByTest }),
  };
}
