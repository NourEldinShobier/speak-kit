import { app, type BrowserWindow } from "electron";
import type { TtsEngine } from "@speakkit/engine";
import os from "node:os";
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
import { desktopAutomation } from "./automation";
import { desktopStreams } from "./automation/streams";
import { createExports } from "./export/service";
import { installExtension } from "./extension";
import { createReading } from "./reader/service";
import { setupTray } from "./desktop-tray";
import { showTrayIcon } from "../shared/settings/behaviour";
import { createUpdates } from "./updates-service";
import { realCommandLine } from "./cli-path/real";
import { agentSkill } from "./agent-skill";
import { nodeSkillFs } from "./agent-skill/real";
import { systemTerminal, type Terminal } from "./cli-terminal";
import { skillFilePath } from "../cli/paths";
import { skillText } from "../shared/control/skill";
import { CONTROL_VERSION } from "../shared/control/contract";
import { writeFile } from "node:fs/promises";
import { setupControl } from "./control";
import { setupCapture } from "./capture";
import { registerDictationIpc } from "./dictation/ipc";
import { testEnv } from "./test-env";
import { fixedInstalledApps } from "./installed-apps";
import { realInstalledApps } from "./installed-apps/real";
import { hotkeyPermissionsReady } from "../shared/permissions/guide";
import { setupPermissions } from "./system/permissions";
import { registerSpeechModelsIpc } from "./speech-models/ipc";
import { DictationService, type DictationServiceOptions } from "./dictation/service";
import { setupTranscripts } from "./transcripts";
import { transcriptNotes } from "./transcripts/notes";
import { NOTES_MODEL } from "./voice-chat/service";
import { setupMeetings } from "./meetings";
import { areaPatcher } from "./settings-areas";
import type { VoiceChat } from "./voice-chat/service";
import { fakeUpdater } from "./updates-fake";
import { cachedHardware, collectResources, speechModelName } from "./resources";
import type { SttExtras } from "./speech-models/service";
import { motionNow, windowMotion } from "./window-motion";
import { memoryOf, probeThisComputer } from "./speech-models/ports";

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
  dictation: Pick<DictationServiceOptions, "dataDir" | "modelsDir" | "sttWorker" | "micOwner" | "pageSite" | "readKey" | "hasKey"> & {
    /** Claims the microphone for a feature (dictation waits while it is held); returns the release. */
    micClaim: (name: string) => () => void;
  };
  /** The notice the tray menu shows while the window is closed. */
  trayNotice(): string | undefined;
  /** The voice engine, for the memory it holds (Settings, Performance). */
  voiceEngine(): TtsEngine | null;
  /** The OpenAI key lives with the voice chat; the meeting notes borrow it. */
  voiceChat: Pick<VoiceChat, "complete" | "status" | "captureInbox">;
}

const shortcutActions = (reading: ReturnType<typeof createReading>, toggleRecording: () => void): Record<ShortcutId, () => void> => ({
  "read-selection": () => void reading.readSelection(),
  "play-pause": () => reading.controller.command({ type: "toggle" }),
  stop: () => reading.controller.command({ type: "stop" }),
  "record-toggle": toggleRecording,
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
  const fixture = testEnv().installedApps;
  registerDictationIpc(dictation, (c) => parent()?.webContents === c, fixture === undefined ? realInstalledApps() : fixedInstalledApps(fixture));
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
function desktopHandlers(
  ctx: Ctx,
  f: {
    reading: ReturnType<typeof createReading>;
    exports: ReturnType<typeof createExports>;
    updates: ReturnType<typeof createUpdates>;
    shortcuts: ReturnType<typeof setupShortcuts>;
    control: ReturnType<typeof setupControl>;
    test: boolean;
    resources: Api["resources"];
  },
) {
  return {
    ...engineHandlers(ctx),
    ...f.exports.handlers,
    ...f.updates.handlers,
    ...f.shortcuts.handlers,
    ...readerHandlers(f.reading),
    ...f.control.handlers,
    installExtension: () => installExtension(!f.test),
    resources: f.resources,
  } satisfies Partial<Api>;
}

/** The command-line tool, the agent skill and the terminal of the Automation page. A test run keeps the skill in its own folder and opens no window: the command that would have run is written to a file. */
function commandLineTools(o: { test: boolean; version: string; dictation: { dataDir: string } }) {
  const shippedDir = app.isPackaged ? path.join(process.resourcesPath, "bin") : undefined;
  const dataDir = o.dictation.dataDir;
  return {
    shippedDir,
    commandLine: realCommandLine({ platform: process.platform, shippedDir, userData: dataDir, home: os.homedir() }),
    agentSkill: agentSkill({
      file: o.test ? path.join(dataDir, "agent-skill", "SKILL.md") : skillFilePath(os.homedir()),
      text: () => skillText(CONTROL_VERSION, o.version),
      fs: nodeSkillFs,
    }),
    terminal: o.test ? testTerminal(path.join(dataDir, "terminal-command.txt")) : systemTerminal(process.platform),
  };
}

const testTerminal = (file: string): Terminal => ({ open: (command, extraPath) => writeFile(file, `${extraPath ?? ""}|${command}`) });

/** Stops every feature; resolves once the control server is down. */
function disposeAll(p: {
  control: { dispose(): Promise<void> };
  shortcuts: { unregisterAll(): void };
  reading: { dispose(): void };
  exports: { dispose(): void };
  updates: { dispose(): void };
  tray: { dispose(): void };
  dictation: { dispose(): unknown };
  capture: { dispose(): void };
  transcripts: { dispose(): unknown };
  meetings: { dispose(): unknown } | undefined;
}): Promise<void> {
  const controlDown = p.control.dispose();
  p.shortcuts.unregisterAll();
  p.reading.dispose();
  p.exports.dispose();
  p.updates.dispose();
  p.tray.dispose();
  void p.dictation.dispose();
  p.capture.dispose();
  void p.transcripts.dispose();
  void p.meetings?.dispose();
  return controlDown;
}

/** Memory per process and model, read when the Performance page asks. */
const hardware = cachedHardware(probeThisComputer);
function readResources(ctx: Ctx, voiceEngine: DesktopOptions["voiceEngine"], dictation: DictationService) {
  return collectResources({
    processes: () => app.getAppMetrics().map((m) => ({ type: m.type, name: m.name, workingSetKb: m.memory.workingSetSize, cpu: m.cpu.percentCPUUsage })),
    voice: () => ({ state: ctx.state.health?.engine.state, name: "Kokoro-82M", pid: (voiceEngine() as { workerPid?: number } | null)?.workerPid }),
    speech: () => {
      const stt = dictation.stt as typeof dictation.stt & SttExtras; // the real engine reports its process and backend
      return { state: stt.status().state, name: speechModelName(ctx.config.dictation.model), pid: stt.workerPid, backend: stt.backend };
    },
    memoryOf,
    hardware,
    platform: process.platform === "darwin" ? "darwin" : "win32",
    arch: process.arch,
  });
}

/** The control server and the command-line tools it lends. */
function desktopControl(ctx: Ctx, o: DesktopOptions, f: Pick<Parameters<typeof setupControl>[1], "reading" | "automation" | "dictation" | "transcripts">) {
  return setupControl(ctx, { ...f, ...commandLineTools(o), dataDir: o.dictation.dataDir, version: o.version });
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
  const shortcuts = setupShortcuts(
    ctx,
    shortcutActions(reading, () => transcripts.toggleRecording()),
    o.test,
  );
  // The dictation service reaches the tray only through this callback, so the tray can be built after it.
  const dictation = new DictationService(ctx, { ...o.dictation, distDir: o.distDir, parent: o.parent, test: o.test }, () => tray.refresh());
  const notes = transcriptNotes({ on: () => ctx.config.meetings.summary, writer: `OpenAI ${NOTES_MODEL}`, complete: (s, u, sig) => o.voiceChat.complete(s, u, sig) });
  const transcripts = setupTranscripts(ctx, { distDir: o.distDir, parent: o.parent, dictation, test: o.test, onChange: () => tray.refresh(), notes });
  let meetings: ReturnType<typeof setupMeetings> | undefined;
  const tray = setupTray(ctx, { reading, exports, updates, dictation, transcripts, meetings: () => meetings, notice: o.trayNotice, requestQuit: o.requestQuit, retryEngine: o.retryEngine });
  Object.assign(ctx.state, { reader: IDLE_READER, update: ctx.state.update ?? UPDATE_UNSUPPORTED });
  wireDictation(o.parent, dictation);
  const control = desktopControl(ctx, o, { reading, automation: automation.host, dictation, transcripts: transcripts.handlers });
  meetings = setupMeetings(ctx, { distDir: o.distDir, parent: o.parent, dictation, voiceChat: o.voiceChat, test: o.test, onChange: () => tray.refresh() });
  const capture = setupCapture(ctx, { dataDir: o.dictation.dataDir, distDir: o.distDir, parent: o.parent, dictation, inbox: o.voiceChat.captureInbox, test: o.test, micClaim: o.dictation.micClaim });

  return {
    handlers: desktopHandlers(ctx, { reading, exports, updates, shortcuts, control, test: o.test, resources: () => readResources(ctx, o.voiceEngine, dictation) }),
    /** What scripts and AI apps may do; the server calls it. */
    automation: automation.host,
    /** Live transcription for other apps on the engine dictation holds. */
    streams: desktopStreams(ctx, { stt: dictation.stt, dictation: () => dictation }),
    /** Called by the IPC layer: is this webContents our mini player? */
    ownsWindow: (c: Electron.WebContents) => reading.owns(c),
    /** Stores the settings of one feature area through the feature that owns it. */
    patchArea: areaPatcher(ctx, { capture, transcripts, meetings: () => meetings }),
    /** Reacts to a Settings change. */
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.doNotDisturb !== undefined) ctx.publish();
      if (patch.hideTrayIcon !== undefined) tray.setVisible(showTrayIcon(ctx.config));
      if (patch.reduceMotion !== undefined) windowMotion.set(motionNow(ctx.config.reduceMotion));
      control.onConfigPatch(patch);
    },
    dictation,
    onEngineState: engineAnnouncer(ctx, toasts),
    onWindowHidden: () => void dictation.mic.setMeter(false), // hidden or minimized: the level meter lets go of the microphone at once
    /** A reading or an export is running: a quit would lose it. */
    busy: () => ctx.state.reader.status === "playing" || ctx.state.reader.status === "preparing" || exports.runningCount() > 0,
    refreshTray: () => tray.refresh(),
    /** The tray icon is wanted but the system would not create it. */
    trayMissing: () => tray.failed(),
    /** A capture that is recording or being saved at quit: resolves when it is saved. Undefined when none is. */
    finishCapture: () => capture.finishForQuit(),
    /** Resolves once the control server is down and its discovery file is gone. */
    dispose: () => disposeAll({ control, shortcuts, reading, exports, updates, tray, dictation, capture, transcripts, meetings }),
    testHook: () => desktopTestHook({ shortcuts, shownToasts, tray, reading, dictation, capture, transcripts, meetings: () => meetings, installs: () => installedByTest }),
  };
}
