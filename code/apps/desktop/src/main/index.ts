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
import { chooseProcessMode } from "./cli-mode";
import { droppedNotices, openConfig } from "./config";
import { setupDesktop } from "./desktop";
import { frameBatch } from "./frame-batch";
import { createAppHandlers, metrics } from "./handlers";
import { isLaunchAtLogin, repairLoginItem, startsHidden } from "./login-item";
import { registerValidatedIpc } from "./ipc-register";
import { setupLibrary } from "./library";
import { initLog } from "./log";
import { MainWindow } from "./main-window";
import { emptyPairing, watchPairing } from "./pairing";
import { registerProtocol } from "./register-protocol";
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
await chooseProcessMode(here);

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
const addActivity = (kind: Activity["kind"], title: string, body: string) => {
  state.activity = [{ id: nextActivityId++, atMs: Date.now(), kind, title, body }, ...state.activity].slice(0, 20);
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
    if (!performance.getEntriesByName("window:shown").length) performance.mark("window:shown");
    void runtime.refreshHealth();
    publish(); // a hidden window is not sent state; it catches up when it shows
  },
  onHidden: () => (runtime.stopPolling(), desktop?.onWindowHidden()),
  busy: () => desktop?.busy() ?? false,
  trayMissing: () => desktop?.trayMissing() ?? false,
  onReleased: () => desktop?.dictation.speech.windowReleased(),
});
const screenVision = createScreenVision();
const micOwners = createMicOwners();
const keyStore = new KeyStore(path.join(dataDir, "voice-chat-key.bin"), safeStorage);
const voiceChat = createVoiceChat({
  store: keyStore,
  config,
  saveConfig: store.save,
  log,
  baseUrl: test.openaiBaseUrl,
  // Dictation waits while a screen look or a conversation in the browser holds the microphone.
  ...micOwners.voiceChat(screenVision.look),
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

function createHandlers() {
  return createAppHandlers({
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
      dictation: {
        dataDir,
        modelsDir,
        sttWorker,
        micOwner: micOwners.owner,
        micClaim: micOwners.claim,
        pageSite: () => runtime.page.current(),
        readKey: () => keyStore.read(),
        hasKey: () => keyStore.has(),
      },
      voiceChat,
    },
  );
}

// `Speak Kit.exe --quit` asks a running instance to exit cleanly (the packaged smoke test and scripts use it).
const QUIT_FLAG = "--quit";
if (!app.requestSingleInstanceLock() || process.argv.includes(QUIT_FLAG)) {
  app.quit();
} else {
  registerProtocol();
  app.on("second-instance", (_e, argv) => {
    if (argv.includes(QUIT_FLAG)) return mainWindow.quit();
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
    watchPower();
    watchPairingActivity();
    const appHandlers = createHandlers();
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

    if (app.isPackaged) repairLoginItem(config.startMinimized); // an update may have moved the program; the entry must start this copy
    const boot = findDeepLink(process.argv) ?? launchLink;
    mainWindow.create(startsHidden(config, process.argv, desktop.trayMissing()) && !boot);
    booted = true;
    await runtime.start(test.token);
    performance.mark("server:listening");
    if (boot?.kind === "pair") mainWindow.sendUi({ type: "nav", page: "settings", sub: "browser" });
    publish();
  });
}
