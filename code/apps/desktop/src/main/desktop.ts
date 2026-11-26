import { app, type BrowserWindow } from "electron";
import path from "node:path";
import type { Api } from "../shared/ipc";
import type { ConfigPatch } from "../shared/schemas";
import { applyLanguage } from "../shared/i18n";
import type { ShortcutId } from "../shared/shortcuts";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { Ctx } from "./context";
import { desktopTestHook } from "./desktop-test-hook";
import { createDesktopToasts, engineAnnouncer } from "./desktop-toasts";
import { setupShortcuts } from "./desktop-shortcuts";
import { desktopAutomation } from "./automation";
import { desktopStreams } from "./automation/streams";
import { createExports } from "./export/service";
import { installExtension } from "./extension";
import { createReading } from "./reader/service";
import { setupTray } from "./desktop-tray";
import { createUpdates } from "./updates-service";
import { registerDictationIpc } from "./dictation/ipc";
import { hotkeyPermissionsReady } from "../shared/permissions/guide";
import { setupPermissions } from "./system/permissions";
import { registerSpeechModelsIpc } from "./speech-models/ipc";
import { DictationService, type DictationServiceOptions } from "./dictation/service";
import { setupTranscripts } from "./transcripts";
import { transcriptNotes } from "./transcripts/notes";
import { NOTES_MODEL } from "./voice-chat/service";
import { areaPatcher } from "./settings-areas";
import type { VoiceChat } from "./voice-chat/service";
import { fakeUpdater } from "./updates-fake";

interface DesktopOptions {
  parent: () => BrowserWindow | null;
  /** Directory of the bundled main-process files (mp3-worker.js sits next to index.js). */
  distDir: string;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
  /** Tests only: releases the voice engine as the idle timer does; false while it is not ready or is busy. */
  unloadEngine(): Promise<boolean>;
  /** The test hook (SPEAKKIT_TEST): shortcuts and toasts are simulated instead of touching the OS. */
  test: boolean;
  /** Version the fake updater announces (tests only; see test-env.ts). */
  fakeUpdate?: string | undefined;
  /** Where dictation keeps its history and models, and its speech worker. */
  dictation: Pick<DictationServiceOptions, "dataDir" | "modelsDir" | "sttWorker" | "writerWorker" | "micOwner" | "pageSite" | "readKey" | "hasKey"> & {
    /** Claims the microphone for a feature (dictation waits while it is held); returns the release. */
    micClaim: (name: string) => () => void;
  };
  /** The notice the tray menu shows while the window is closed. */
  trayNotice(): string | undefined;
  /** The OpenAI key lives with the voice chat; the transcript notes borrow it. */
  voiceChat: Pick<VoiceChat, "complete">;
}

const shortcutActions = (reading: ReturnType<typeof createReading>): Record<ShortcutId, () => void> => ({
  "read-selection": () => void reading.readSelection(),
  "play-pause": () => reading.controller.command({ type: "toggle" }),
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

/** The dictation IPC, and the permissions the hotkey needs. */
function wireDictation(parent: DesktopOptions["parent"], dictation: DictationService): void {
  registerDictationIpc(dictation, (c) => parent()?.webContents === c);
  registerSpeechModelsIpc(dictation.speech, (c) => parent()?.webContents === c);
  watchPermissions(parent, dictation);
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

/** The IPC methods the desktop features add. */
function desktopHandlers(f: {
  reading: ReturnType<typeof createReading>;
  exports: ReturnType<typeof createExports>;
  updates: ReturnType<typeof createUpdates>;
  shortcuts: ReturnType<typeof setupShortcuts>;
  test: boolean;
}) {
  return {
    ...f.exports.handlers,
    ...f.updates.handlers,
    ...f.shortcuts.handlers,
    ...readerHandlers(f.reading),
    installExtension: () => installExtension(!f.test),
  } satisfies Partial<Api>;
}

/** Stops every feature. */
function disposeAll(p: {
  shortcuts: { unregisterAll(): void };
  reading: { dispose(): void };
  exports: { dispose(): void };
  updates: { dispose(): void };
  tray: { dispose(): void };
  dictation: { dispose(): unknown };
  transcripts: { dispose(): unknown };
}): void {
  p.shortcuts.unregisterAll();
  p.reading.dispose();
  p.exports.dispose();
  p.updates.dispose();
  p.tray.dispose();
  void p.dictation.dispose();
  void p.transcripts.dispose();
}

/**
 * Everything beyond the server and the main window: global shortcuts, reading and the mini player, toasts,
 * exports, updates and the tray. `handlers` are the IPC methods these features add.
 */
export function setupDesktop(ctx: Ctx, o: DesktopOptions) {
  const { toasts, shown: shownToasts } = createDesktopToasts(ctx, o.test);
  const reading = createReading(ctx, toasts, (r) => {
    tray.refresh();
    automation.onReader(r);
  });
  const exports = createExports(ctx, toasts, { parent: o.parent, workerFile: new URL("./mp3-worker.js", `file://${path.resolve(o.distDir)}/`), onChange: () => tray.refresh() });
  const automation = desktopAutomation(ctx, { reading, exports, dictation: () => dictation });
  let installedByTest = 0;
  const stopWork = () => stopForRestart(reading, exports);
  const updates = createUpdates(ctx, toasts, () => tray.refresh(), stopWork, __TEST_CODE__ && o.fakeUpdate ? () => fakeUpdater(o.fakeUpdate!, () => void installedByTest++) : undefined);
  const shortcuts = setupShortcuts(ctx, shortcutActions(reading), o.test);
  // The dictation service reaches the tray only through this callback, so the tray can be built after it.
  const dictation = new DictationService(ctx, { ...o.dictation, distDir: o.distDir, parent: o.parent, test: o.test }, () => tray.refresh());
  const notes = transcriptNotes({ on: () => ctx.config.transcripts.notes, writer: `OpenAI ${NOTES_MODEL}`, complete: (s, u, sig) => o.voiceChat.complete(s, u, sig) });
  const transcripts = setupTranscripts(ctx, { distDir: o.distDir, parent: o.parent, dictation, test: o.test, notes });
  const tray = setupTray(ctx, { reading, exports, updates, dictation, notice: o.trayNotice, requestQuit: o.requestQuit, retryEngine: o.retryEngine });
  Object.assign(ctx.state, { reader: IDLE_READER, update: ctx.state.update ?? UPDATE_UNSUPPORTED });
  wireDictation(o.parent, dictation);

  return {
    handlers: desktopHandlers({ reading, exports, updates, shortcuts, test: o.test }),
    /** What scripts and AI apps may do; the server calls it. */
    automation: automation.host,
    /** Live transcription for other apps on the engine dictation holds. */
    streams: desktopStreams(ctx, { stt: dictation.stt, dictation: () => dictation }),
    /** Called by the IPC layer: is this webContents our mini player? */
    ownsWindow: (c: Electron.WebContents) => reading.owns(c),
    /** Stores the settings of one feature area through the feature that owns it. */
    patchArea: areaPatcher({ speech: dictation.speech, transcripts }),
    /** Reacts to a Settings change. */
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.language !== undefined) void applyLanguage(patch.language, app.getPreferredSystemLanguages()).then(() => tray.refresh());
    },
    dictation,
    onEngineState: engineAnnouncer(ctx, toasts),
    onWindowHidden: () => void dictation.mic.setMeter(false), // hidden or minimized: the level meter lets go of the microphone at once
    /** A reading or an export is running: a quit would lose it. */
    busy: () => ctx.state.reader.status === "playing" || ctx.state.reader.status === "preparing" || exports.runningCount() > 0,
    refreshTray: () => tray.refresh(),
    /** The system would not create the tray icon. */
    trayMissing: () => tray.failed(),
    dispose: () => disposeAll({ shortcuts, reading, exports, updates, tray, dictation, transcripts }),
    testHook: () => desktopTestHook({ shortcuts, shownToasts, tray, reading, dictation, transcripts, installs: () => installedByTest, unloadEngine: o.unloadEngine }),
  };
}
