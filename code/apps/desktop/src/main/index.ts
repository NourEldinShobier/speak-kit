import { app, ipcMain, Menu, nativeTheme, powerMonitor, safeStorage } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { channel, METHODS, type Activity, type AppState, type Method } from "../shared/ipc";
import { ARGS } from "../shared/schemas";
import { findDeepLink, handleDeepLink, type DeepLink } from "../shared/deeplink";
import { applyMemory } from "../shared/memory";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import { DEFAULT_SHORTCUTS } from "../shared/shortcuts";
import { appMenuTemplate } from "./app-menu";
import { droppedNotices, openConfig } from "./config";
import { setupDesktop } from "./desktop";
import { frameBatch } from "./frame-batch";
import { applyExternalConfig, createAppHandlers, metrics, type HandlerDeps } from "./handlers";
import { watchConfigFile } from "./config-watch";
import { motionNow, windowMotion } from "./window-motion";
import { createTrayNotices, NOTICE_TTL_MS, noticeText } from "../shared/tray-notices";
import { acquireInstance, classifySecondLaunch, clearRunningVersion, readRunningVersion, stopGuard, writeRunningVersion } from "./single-instance";
import { isLaunchAtLogin, openedAtLogin, repairLaunchAtLogin } from "./login-item";
import { registerValidatedIpc } from "./ipc-register";
import { setupLibrary } from "./library";
import { initLog } from "./log";
import { MainWindow } from "./main-window";
import { emptyPairing, watchPairing } from "./pairing";
import { ServerApi } from "./server-api";
import { sttWorkerUrl } from "./dictation/service-support";
import { engineWorkerUrl, ServerRuntime } from "./server-lifecycle";
import { testEnv } from "./test-env";
import { createScreenVision } from "./screen-vision";
import { createMicOwners } from "./mic-owners";
import { KeyStore } from "./voice-chat/key-store";
import { createVoiceChat } from "./voice-chat/service";

const here = path.dirname(fileURLToPath(import.meta.url));
const test = testEnv();

// Tests (and portable installs) isolate all state under one directory; this also scopes the single-instance lock.
// Otherwise a fixed directory: a dev run and the installed app must share one userData, or each gets its own lock and two instances can run.
app.setPath("userData", process.env.SPEAKKIT_USER_DATA ?? path.join(app.getPath("appData"), "@speakkit", "desktop"));
// The UI is plain CSS: skip the GPU process (about 100 MB private) and let Chromium rasterize in software.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2");
// A wav file the microphone window records instead of a device (dictation end-to-end run).
const fakeMic = test.hook ? process.env.SPEAKKIT_FAKE_MIC : undefined;
if (fakeMic) {
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-file-for-fake-audio-capture", fakeMic);
}
const dataDir = app.getPath("userData");
await mkdir(dataDir, { recursive: true });
const log = initLog(dataDir);
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? path.join(dataDir, "models");
const logsDir = path.join(dataDir, "logs");

const sttWorker = await sttWorkerUrl(here);
const store = await openConfig(dataDir);
const config = store.config;

const state: AppState = {
  version: app.getVersion(),
  platform: process.platform,
  port: 0,
  portFallback: false,
  token: "",
  health: null,
  serverError: null,
  config,
  launchAtLogin: false,
  onBattery: false,
  pairing: emptyPairing(),
  activity: [],
  reader: IDLE_READER,
  shortcuts: { bindings: { ...DEFAULT_SHORTCUTS }, conflicts: {} },
  update: UPDATE_UNSUPPORTED,
  exports: [],
  exportDir: config.exportPrefs.folder || path.join(app.getPath("music"), "Speak Kit"),
  settingsNotice: store.notice,
  packaged: app.isPackaged,
};

let nextActivityId = 1;
const trayNotices = createTrayNotices();
// The window is built after the first activity lines are written (settings that were repaired): until then nobody is looking.
let windowVisible = () => false;
let noticeTimer: NodeJS.Timeout | undefined;
const addActivity = (kind: Activity["kind"], title: string, body: string) => {
  state.activity = [{ id: nextActivityId++, atMs: Date.now(), kind, title, body }, ...state.activity].slice(0, 20);
  // A problem while the window is closed stays in the tray menu until the window opens or ten minutes pass.
  const note = noticeText({ kind, title });
  if (note && !windowVisible()) {
    trayNotices.add(note);
    desktop?.refreshTray();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => desktop?.refreshTray(), NOTICE_TTL_MS + 1000);
    noticeTimer.unref();
  }
};

const unreadable = (what: string, file: string) =>
  addActivity("error", `${what} could not be read`, `Speak Kit started from defaults. The old file is kept as ${path.basename(file)} in ${path.dirname(file)}.`);
if (store.recovered) unreadable("Settings", store.recovered);
for (const n of droppedNotices(store.dropped)) addActivity("error", n.title, n.body);

const sinks = new Set<(s: AppState) => void>();
const serverApi = new ServerApi(
  () => `http://127.0.0.1:${state.port}`,
  () => state.token,
);
let desktop: ReturnType<typeof setupDesktop> | null = null;

const mainWindow: MainWindow = new MainWindow(config, {
  onVisible: () => {
    trayNotices.clear();
    desktop?.refreshTray();
    if (!performance.getEntriesByName("window:shown").length) performance.mark("window:shown");
    void runtime.refreshHealth();
    publish(); // a hidden window is not sent state; it catches up when it shows
  },
  onHidden: () => (runtime.stopPolling(), desktop?.onWindowHidden()),
  busy: () => desktop?.busy() ?? false,
  onReleased: () => desktop?.dictation.speech.windowReleased(),
});
windowVisible = () => mainWindow.isVisible();
windowMotion.set(motionNow(config.reduceMotion));
const screenVision = createScreenVision();
const micOwners = createMicOwners();
const keyStore = new KeyStore(path.join(dataDir, "voice-chat-key.bin"), safeStorage);
const voiceChat = createVoiceChat({
  store: keyStore,
  config,
  saveConfig: store.save,
  log,
  baseUrl: test.openaiBaseUrl,
  // Dictation waits while a screen look has the microphone busy with its own session.
  look: micOwners.holding("Screen look", screenVision.look),
});
const runtime: ServerRuntime = new ServerRuntime({
  state,
  config,
  dataDir,
  modelsDir,
  engineWorker: await engineWorkerUrl(here),
  log,
  api: serverApi,
  voiceChat: voiceChat.server,
  publish,
  isVisible: () => mainWindow.isVisible(),
  onEngineState: (prev, next, detail) => desktop?.onEngineState(prev, next, detail),
});

/** Many features publish in a burst (an engine event, an export tick, a settings change): the windows get one send per frame. */
const sendState = frameBatch(() => {
  state.launchAtLogin = isLaunchAtLogin(config.startMinimized);
  mainWindow.sendState(state);
  for (const sink of sinks) sink(state);
});

function publish(): AppState {
  sendState();
  return state;
}

const PROTOCOL = "speakkit";
function registerProtocol() {
  // Tests run with an isolated userData; do not touch the user's registry then.
  if (process.env.SPEAKKIT_USER_DATA && !process.env.SPEAKKIT_REGISTER_PROTOCOL) return;
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}

function onDeepLink(link: DeepLink) {
  log.info("deep link", link.kind);
  handleDeepLink(link, {
    ensureServer: () => {
      if (!runtime.server) void runtime.start(state.token || undefined).then(publish);
    },
    showWindow: () => mainWindow.show(),
    navigate: (sub) => mainWindow.sendUi({ type: "nav", page: "settings", sub }),
  });
}

function watchPower() {
  state.onBattery = powerMonitor.isOnBatteryPower();
  const onPower = (battery: boolean) => {
    state.onBattery = battery;
    applyMemory(runtime.server, config, battery);
    publish();
  };
  powerMonitor.on("on-battery", () => onPower(true));
  powerMonitor.on("on-ac", () => onPower(false));
}

function watchPairingActivity() {
  watchPairing(state.pairing, {
    token: () => state.token,
    port: () => state.port,
    onChange: () => {
      if (state.pairing.firstSeenMs === state.pairing.lastSeenMs) addActivity("pair", "Browser paired", "An extension made its first call.");
      publish();
    },
  });
}

function handlerDeps(): HandlerDeps {
  return {
    state,
    config,
    saveConfig: store.save,
    publish,
    runtime,
    mainWindow,
    api: serverApi,
    voiceChat,
    dataDir,
    modelsDir,
    logsDir,
    addActivity,
    onConfigPatch: (patch) => desktop?.onConfigPatch(patch),
  };
}

function watchSettingsFile() {
  return watchConfigFile({
    file: store.path,
    current: () => config,
    keep: process.env.SPEAKKIT_PORT ? ["preferredPort"] : [],
    onEdit: (edit) => {
      if (edit.kind === "newer") return;
      addActivity("info", "Settings changed outside the app", `Picked up: ${edit.keys.join(", ")}.`);
      log.warn("settings file edited outside the app", edit.keys.join(","), edit.repaired.length ? `repaired: ${edit.repaired.join(",")}` : "");
      applyExternalConfig(handlerDeps(), edit.patch);
    },
    onUnreadable: () => {
      addActivity("info", "Settings file could not be read", "The file was edited and is not valid. The app keeps the settings it has.");
      log.warn("settings file edited outside the app is not valid; keeping the running settings");
      publish();
    },
  });
}

function startDesktop() {
  return setupDesktop(
    {
      state,
      config,
      saveConfig: store.save,
      publish,
      sinks,
      showWindow: () => mainWindow.show(),
      sendUi: (e) => mainWindow.sendUi(e),
      addActivity,
      server: serverApi,
      log,
      looking: () => mainWindow.isVisible() && mainWindow.isFocused(),
    },
    {
      parent: () => mainWindow.window,
      distDir: here,
      requestQuit: () => {
        mainWindow.show();
        mainWindow.sendUi({ type: "confirm-quit" });
      },
      retryEngine: () => runtime.retry(),
      test: test.hook,
      fakeUpdate: test.fakeUpdate,
      version: app.getVersion(),
      voiceEngine: () => runtime.engine,
      trayNotice: () => trayNotices.current(),
      dictation: { dataDir, modelsDir, sttWorker, micOwner: micOwners.owner, readKey: () => keyStore.read(), hasKey: () => keyStore.has() },
      voiceChat,
    },
  );
}

// `Speak Kit.exe --quit` asks a running instance to exit cleanly (the packaged smoke test and scripts use it).
const QUIT_FLAG = "--quit";
// A newer install waits for an older running copy it asks to leave; a copy that is stuck leaves by itself after the stop guard.
const ownVersion = app.getVersion();
const lock = () => app.requestSingleInstanceLock({ version: ownVersion });
const mayRun = process.argv.includes(QUIT_FLAG)
  ? (lock(), false)
  : await acquireInstance({ tryLock: lock, runningVersion: () => readRunningVersion(dataDir), ownVersion, wait: (ms) => new Promise((r) => setTimeout(r, ms)) });
if (!mayRun) {
  app.quit();
} else {
  void writeRunningVersion(dataDir, ownVersion);
  app.on("will-quit", () => void clearRunningVersion(dataDir));
  registerProtocol();
  app.on("second-instance", (_e, argv, _cwd, incoming) => {
    const why = classifySecondLaunch(argv, ownVersion, incoming);
    if (why !== "open") {
      mainWindow.quit();
      stopGuard(() => app.exit(0));
      return;
    }
    const link = findDeepLink(argv);
    if (link) onDeepLink(link);
    else mainWindow.show();
  });
  // macOS delivers speakkit:// links as open-url events, also at launch, before the app is ready.
  let launchLink: DeepLink | null = null;
  app.on("open-url", (e, url) => {
    e.preventDefault();
    const link = findDeepLink([url]);
    if (!link) return;
    if (app.isReady()) onDeepLink(link);
    else launchLink = link;
  });
  // Dock icon clicked while the window is hidden to the menu bar (the activation at launch must not defeat --hidden).
  let booted = false;
  app.on("activate", () => booted && mainWindow.show());
  let captureSaved = false;
  app.on("before-quit", (e) => {
    mainWindow.quitting = true;
    // A recording is saved, not thrown away, when the app quits.
    const saving = captureSaved ? undefined : desktop?.finishCapture();
    if (!saving) return;
    e.preventDefault();
    void saving.finally(() => {
      captureSaved = true;
      app.quit();
    });
  });
  app.on("window-all-closed", () => {
    /* stay alive in the tray */
  });
  let cleaned = false;
  app.on("will-quit", (event) => {
    if (cleaned) return;
    cleaned = true;
    // Quit again once the control server has removed its discovery file, so a quit never leaves a token behind (capped, so it cannot hold the quit).
    event.preventDefault();
    const controlDown = Promise.race([Promise.resolve(desktop?.dispose()), new Promise((r) => setTimeout(r, 2000))]);
    screenVision.dispose();
    void runtime.shutdown();
    void controlDown.finally(() => app.quit());
  });

  app.whenReady().then(async () => {
    performance.mark("main:ready");
    const menu = appMenuTemplate(process.platform);
    Menu.setApplicationMenu(menu && Menu.buildFromTemplate(menu));
    nativeTheme.themeSource = "light"; // Speak Kit has no dark mode
    await setupLibrary({
      dataDir,
      window: () => mainWindow.window,
      target: () => ({ port: state.port, token: state.token }),
      allowLocalUrls: test.allowLocalUrls,
      distDir: here,
      onRecovered: (f) => unreadable("The library", f),
    });
    if (config.setupDone && !process.env.SPEAKKIT_USER_DATA) repairLaunchAtLogin(config.startMinimized);
    watchPower();
    watchPairingActivity();
    const appHandlers = createAppHandlers(handlerDeps());
    const settingsWatch = watchSettingsFile();
    app.once("will-quit", () => settingsWatch.dispose());
    desktop = startDesktop();
    runtime.automation.attach(desktop.automation);
    const handlers = { ...appHandlers, ...desktop.handlers } as unknown as Record<Method, (...a: unknown[]) => unknown>;
    registerValidatedIpc<Method>(ipcMain, {
      methods: METHODS,
      channel,
      args: ARGS,
      handler: (m) => handlers[m],
      trusted: (e) => mainWindow.owns(e.sender) || !!desktop?.ownsWindow(e.sender),
    });
    // Test hook: native menus and global key presses cannot be driven from Playwright.
    if (test.hook)
      (globalThis as Record<string, unknown>).__speakkit = {
        metrics,
        marks: () => performance.getEntriesByType("mark").map((m) => ({ name: m.name, at: Math.round(m.startTime) })),
        ...desktop.testHook(),
      };

    const boot = findDeepLink(process.argv) ?? launchLink;
    const hidden =
      config.setupDone &&
      !config.hideTrayIcon && // a hidden tray icon leaves no way to open a hidden window
      (process.argv.includes("--hidden") || (config.startMinimized && openedAtLogin(true)));
    mainWindow.create(hidden && !boot);
    booted = true;
    await runtime.start(test.token);
    performance.mark("server:listening");
    if (boot?.kind === "pair") mainWindow.sendUi({ type: "nav", page: "settings", sub: "browser" });
    publish();
  });
}
