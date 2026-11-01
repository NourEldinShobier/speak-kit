import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerMonitor,
  shell,
  Tray,
} from "electron";
import * as v from "valibot";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FrameDecoder, type Health, type VoiceList } from "@speakkit/protocol";
import { createServer } from "@speakkit/server";
import { FakeEngine, KokoroEngine, type TtsEngine } from "@speakkit/engine";
import {
  channel,
  METHODS,
  STATE_EVENT,
  UI_EVENT,
  type Activity,
  type Api,
  type AppState,
  type Metrics,
  type Method,
  type PreviewAudio,
  type StorageInfo,
  type UiEvent,
} from "../shared/ipc";
import { ARGS } from "../shared/schemas";
import { trayState, trayTooltip, type TrayState } from "../shared/engine-view";
import { findDeepLink, handleDeepLink, type DeepLink } from "../shared/deeplink";
import { applyMemory, serverOptions } from "../shared/memory";
import { listenWithFallback } from "./ports";
import { appIcon, trayIcon } from "./icon";
import { openConfig } from "./config";
import { initLog } from "./log";
import { emptyPairing, watchPairing } from "./pairing";
import { noticeFor, type NoticeKind } from "./notify-rules";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLE = "SpeakKit";
/** Window hidden this long (ms): destroy it. 0 disables. */
const HIDE_DESTROY_MS = Number(process.env.SPEAKKIT_DESTROY_MS ?? 30_000);

// Tests (and portable installs) isolate all state under one directory; this also scopes the single-instance lock.
if (process.env.SPEAKKIT_USER_DATA) app.setPath("userData", process.env.SPEAKKIT_USER_DATA);
// The UI is plain CSS: skip the GPU process (about 100 MB private) and let Chromium rasterize in software.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2");
const dataDir = app.getPath("userData");
mkdirSync(dataDir, { recursive: true });
const log = initLog(dataDir);
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? path.join(dataDir, "models");
const logsDir = path.join(dataDir, "logs");

const store = openConfig(dataDir);
const config = store.config;
const saveConfig = store.save;

// ---- state ----
type Srv = Awaited<ReturnType<typeof listenWithFallback<ReturnType<typeof createServer>>>>["server"];
let server: Srv | null = null;
let engine: TtsEngine | null = null; // outlives token/port changes; recreated on retry
let firstEngine = true;
let unsubEngine: (() => void) | null = null;
let lastEngineState: Health["engine"]["state"] | undefined;
let nextActivityId = 1;
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
};
const tokenFile = path.join(dataDir, "token");

function addActivity(kind: Activity["kind"], title: string, body: string) {
  state.activity = [{ id: nextActivityId++, atMs: Date.now(), kind, title, body }, ...state.activity].slice(0, 20);
}

// ---- engine and server ----
function newEngine(): TtsEngine {
  if (process.env.SPEAKKIT_ENGINE === "fake") {
    // Test hook: the first engine starts in the given state (e.g. error); a retry gets a healthy one.
    const forced = firstEngine
      ? (process.env.SPEAKKIT_FAKE_STATE as "downloading" | "error" | "unloaded" | undefined)
      : undefined;
    const e = new FakeEngine({ latencyMs: Number(process.env.SPEAKKIT_FAKE_LATENCY_MS ?? 0), state: forced });
    if (forced === "downloading" || forced === "error") {
      e.setStatus({
        state: forced,
        progress: 0.62,
        detail: "huggingface.co, connection reset (ECONNRESET)",
      });
      e.start = async () => {};
    }
    return e;
  }
  // The engine module is bundled into dist/main, so point its worker at the real source file next to it.
  const workerUrl = new URL("./worker.ts", import.meta.resolve("@speakkit/engine"));
  return new KokoroEngine({ modelsDir, workerUrl });
}

/** Creates the engine without loading anything. The model is downloaded on request (setup) or loaded on first play (server). */
function createEngine() {
  unsubEngine?.();
  engine = newEngine();
  firstEngine = false;
  lastEngineState = engine.status().state;
  unsubEngine = engine.onStatus(() => void onEngineEvent());
  const st = engine.status().state;
  // Setup finished but the model is gone: fetch it again. Otherwise stay lazy unless the user asked for load at startup.
  if (config.loadAtStart || (config.setupDone && st === "missing")) startEngine();
}

function startEngine() {
  engine?.start().catch((e) => log.warn("engine start failed", e instanceof Error ? e.message : e)); // reported through status -> /v1/health
}

async function stopServer() {
  const s = server;
  server = null;
  state.port = 0;
  await s?.close();
}

async function startServer(token?: string) {
  state.serverError = null;
  try {
    if (!engine) createEngine();
    const { server: s, port } = await listenWithFallback(config.preferredPort, (port) =>
      createServer({
        engine: engine!,
        dataDir,
        port,
        version: state.version,
        ...(token ? { token } : {}),
        // Lazy-load options of the server build; extra keys are ignored by a build that predates them.
        ...serverOptions(config),
      }),
    );
    server = s;
    state.port = port;
    state.portFallback = port !== config.preferredPort;
    state.token = s.token;
    const missing = applyMemory(s, config, state.onBattery);
    if (missing.length) log.info("server has no runtime setter for:", missing.join(", "));
    log.info(`server listening on 127.0.0.1:${port}`);
  } catch (e) {
    state.serverError = e instanceof Error ? e.message : String(e);
    log.error("server failed to start", state.serverError);
  }
  await refreshHealth();
}

async function restartServer(token?: string) {
  await stopServer();
  await startServer(token);
  return publish();
}

// ---- health: fetched on engine events and, while the window is visible, on a timer; never polled while hidden ----
let healthTimer: NodeJS.Timeout | undefined;
let lastTray: string | undefined;
const lastSent: Partial<Record<NoticeKind, number>> = {};

async function fetchHealth(): Promise<Health | null> {
  if (!state.port) return null;
  try {
    const r = await fetch(`http://127.0.0.1:${state.port}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return (await r.json()) as Health;
  } catch {
    return null; // server busy or stopped
  }
}

async function refreshHealth() {
  const health = await fetchHealth();
  if (JSON.stringify(health) !== JSON.stringify(state.health)) {
    state.health = health;
    updateTray();
    publish();
  }
  clearTimeout(healthTimer);
  healthTimer = undefined;
  if (isVisible()) {
    const s = health?.engine.state;
    healthTimer = setTimeout(refreshHealth, s === "loading" || s === "downloading" || !health ? 700 : 5000);
  }
}

async function onEngineEvent() {
  await refreshHealth();
  const next = engine?.status();
  if (!next) return;
  const n = noticeFor(
    lastEngineState,
    next.state,
    next.detail,
    { download: config.notifyDownload, error: config.notifyError },
    lastSent,
    Date.now(),
  );
  lastEngineState = next.state;
  if (!n) return;
  lastSent[n.kind] = Date.now();
  addActivity(n.kind, n.title, n.body);
  publish();
  const looking = isVisible() && win?.isFocused();
  if (!looking && !process.env.SPEAKKIT_QUIET_NOTIFY && Notification.isSupported()) {
    const toast = new Notification({ title: n.title, body: n.body });
    toast.on("click", showWindow);
    toast.show();
  }
}

// ---- window ----
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMenu: Menu | null = null;
let quitting = false;
let pendingUi: UiEvent[] = [];

const isVisible = () => !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();

function publish(): AppState {
  state.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  if (win && !win.isDestroyed()) win.webContents.send(STATE_EVENT, state);
  return state;
}

function sendUi(e: UiEvent) {
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send(UI_EVENT, e);
  else pendingUi.push(e);
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

const overlay = () => ({
  color: "#00000000",
  symbolColor: nativeTheme.shouldUseDarkColors ? "#BFBFBF" : "#3B3B3B",
  height: config.setupDone ? 40 : 32, // Lumen: shell title bar 40, setup window 32
});

/** Setup is a fixed 960x680 window; after setup the app window is 1280x800 and resizable. */
function applyWindowMode(first = false) {
  if (!win || win.isDestroyed()) return;
  win.setTitleBarOverlay(overlay());
  if (config.setupDone) {
    win.setMinimumSize(960, 640);
    win.setResizable(true);
    if (!first) {
      win.setContentSize(1280, 800);
      win.center();
    }
  } else {
    win.setMinimumSize(960, 680);
    win.setResizable(false);
    win.setContentSize(960, 680);
  }
}

function createWindow(hidden: boolean) {
  const w = (win = new BrowserWindow({
    useContentSize: true,
    width: config.setupDone ? 1280 : 960,
    height: config.setupDone ? 800 : 680,
    title: TITLE,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#191A1B" : "#F3F3F6",
    icon: appIcon(),
    titleBarStyle: "hidden",
    titleBarOverlay: overlay(),
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true, // hidden window: timers and rendering are throttled by Chromium
    },
  }));
  applyWindowMode(true);
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("did-finish-load", () => {
    for (const e of pendingUi.splice(0)) w.webContents.send(UI_EVENT, e);
  });
  w.once("ready-to-show", () => {
    if (!hidden) w.show();
  });
  // Resume polling when shown; stop (no timers) when hidden or minimized.
  w.on("show", () => void refreshHealth());
  w.on("restore", () => void refreshHealth());
  const stopPolling = () => {
    clearTimeout(healthTimer);
    healthTimer = undefined;
  };
  // Hidden to the tray for a while: drop the renderer and GPU memory (about 200 MB); showWindow() rebuilds it in a moment.
  let destroyTimer: NodeJS.Timeout | undefined;
  w.on("show", () => clearTimeout(destroyTimer));
  w.on("hide", () => {
    stopPolling();
    if (HIDE_DESTROY_MS > 0) destroyTimer = setTimeout(() => !w.isDestroyed() && !w.isVisible() && w.destroy(), HIDE_DESTROY_MS);
  });
  w.on("minimize", stopPolling);
  // Closing hides to the tray; only Quit (tray menu or app.quit) really exits.
  w.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    w.hide();
  });
  w.on("closed", () => {
    if (win === w) win = null;
  });
  w.loadFile(path.join(here, "../renderer/index.html"));
}

// ---- tray ----
function requestQuit() {
  showWindow();
  sendUi({ type: "confirm-quit" });
}

function createTray() {
  tray = new Tray(trayIcon("asleep"));
  trayMenu = Menu.buildFromTemplate([
      { label: "Read clipboard (coming later)", enabled: false },
      { type: "separator" },
      { label: "Open SpeakKit", click: showWindow },
      { label: "Pause", click: () => sendUi({ type: "pause" }) },
      { type: "separator" },
      {
        label: "Settings",
        click: () => {
          showWindow();
          sendUi({ type: "nav", page: "settings", sub: "general" });
        },
      },
      { type: "separator" },
      { label: "Quit SpeakKit", click: requestQuit },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on("click", showWindow);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const ts: TrayState = trayState(state.health, state.serverError);
  const tip = trayTooltip(state.health, state.serverError);
  if (lastTray === `${ts}|${tip}`) return;
  lastTray = `${ts}|${tip}`;
  tray.setImage(trayIcon(ts));
  tray.setToolTip(tip);
}

// ---- IPC ----
const auth = () => ({ Authorization: `Bearer ${state.token}` });
const base = () => `http://127.0.0.1:${state.port}`;

async function preview(voice: string, text: string, speed = 1): Promise<PreviewAudio> {
  const res = await fetch(`${base()}/v1/speak`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ sentences: [text], voice, speed }),
  });
  if (!res.ok || !res.body) throw new Error(`speak failed: HTTP ${res.status}`);
  const dec = new FrameDecoder();
  const out: PreviewAudio = { sampleRate: 24000, chunks: [] };
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const f of dec.push(value)) {
      if (f.header.type === "error") throw new Error(f.header.message);
      if (f.header.type === "audio" && f.pcm) {
        out.sampleRate = f.header.sampleRate;
        out.chunks.push(f.pcm);
      }
    }
  }
  return out;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : await stat(p).then((s) => s.size, () => 0);
  }
  return total;
}

async function storage(): Promise<StorageInfo> {
  const [modelsBytes, logsBytes, all] = await Promise.all([dirSize(modelsDir), dirSize(logsDir), dirSize(dataDir)]);
  const inside = modelsDir.startsWith(dataDir) ? modelsBytes : 0;
  return { modelsDir, logsDir, modelsBytes, logsBytes, otherBytes: Math.max(0, all - inside - logsBytes) };
}

function metrics(): Metrics {
  const mb = (kb: number) => Math.round((kb / 1024) * 10) / 10;
  let main = 0;
  let renderer = 0;
  let other = 0;
  for (const m of app.getAppMetrics()) {
    const ws = m.memory.workingSetSize;
    if (m.type === "Browser") main += ws;
    else if (m.type === "Tab") renderer += ws;
    else other += ws;
  }
  return { totalMb: mb(main + renderer + other), mainMb: mb(main), rendererMb: mb(renderer), otherMb: mb(other) };
}

function applyLogin() {
  app.setLoginItemSettings({ openAtLogin: app.getLoginItemSettings().openAtLogin, args: config.startMinimized ? ["--hidden"] : [] });
}

const handlers: { [K in Method]: Api[K] } = {
  state: async () => publish(),
  patchConfig: async (patch) => {
    const setupWas = config.setupDone;
    Object.assign(config, patch);
    saveConfig();
    if (patch.theme) nativeTheme.themeSource = config.theme;
    if (patch.startMinimized !== undefined) applyLogin();
    if (patch.idleUnload || patch.batterySaver !== undefined) applyMemory(server, config, state.onBattery);
    if (patch.loadAtStart && engine?.status().state === "unloaded") startEngine();
    if (config.setupDone !== setupWas) applyWindowMode();
    return publish();
  },
  setLaunchAtLogin: async (on) => {
    app.setLoginItemSettings({ openAtLogin: on, args: config.startMinimized ? ["--hidden"] : [] });
    return publish();
  },
  setPort: async (port) => {
    config.preferredPort = port;
    saveConfig();
    return restartServer(state.token);
  },
  regenerateToken: async () => {
    const token = randomBytes(32).toString("hex");
    writeFileSync(tokenFile, token);
    Object.assign(state.pairing, emptyPairing());
    addActivity("info", "Pairing token regenerated", "Every paired browser must be paired again.");
    return restartServer(token);
  },
  retryEngine: async () => {
    await stopServer();
    await engine?.close().catch(() => {});
    engine = null;
    await startServer(state.token || undefined);
    startEngine();
    return publish();
  },
  downloadModel: async () => {
    if (!engine) createEngine();
    const st = engine!.status().state;
    if (st === "missing" || st === "error") startEngine();
    await refreshHealth();
    return publish();
  },
  voices: async () => {
    const r = await fetch(`${base()}/v1/voices`, { headers: auth() });
    if (!r.ok) throw new Error(`voices failed: HTTP ${r.status}`);
    return (await r.json()) as VoiceList;
  },
  preview,
  copy: async (text) => clipboard.writeText(text),
  openExternal: async (link) => {
    const urls = { webstore: "https://chromewebstore.google.com/search/SpeakKit" };
    await shell.openExternal(urls[link]);
  },
  openPath: async (which) => {
    const dir = which === "models" ? modelsDir : logsDir;
    mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
  },
  storage,
  metrics: async () => metrics(),
  hideWindow: async () => win?.hide(),
  quit: async () => {
    quitting = true;
    app.quit();
  },
};

function registerIpc() {
  for (const m of METHODS)
    ipcMain.handle(channel(m), (e, ...args) => {
      if (!win || e.sender !== win.webContents) throw new Error("Untrusted sender");
      const parsed = v.safeParse(ARGS[m], args);
      if (!parsed.success) throw new Error(`Invalid arguments for ${m}`);
      return (handlers[m] as (...a: unknown[]) => unknown)(...parsed.output);
    });
}

// ---- deep link: speakkit://launch and speakkit://pair ----
const PROTOCOL = "speakkit";
function registerProtocol() {
  // Tests run with an isolated userData; do not touch the user's registry then.
  if (process.env.SPEAKKIT_USER_DATA && !process.env.SPEAKKIT_REGISTER_PROTOCOL) return;
  if (process.defaultApp && process.argv[1])
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}

function onDeepLink(link: DeepLink) {
  log.info("deep link", link.kind);
  handleDeepLink(link, {
    ensureServer: () => {
      if (!server) void startServer(state.token || undefined).then(publish);
    },
    showWindow,
    navigate: (page) => sendUi({ type: "nav", page }),
  });
}

// Test hook (only when SPEAKKIT_TEST is set): native menus cannot be clicked from Playwright.
if (process.env.SPEAKKIT_TEST)
  (globalThis as Record<string, unknown>).__speakkit = {
    clickTray: (label: string) => {
      const item = trayMenu?.items.find((i) => i.label === label);
      if (!item || !item.enabled) throw new Error(`no enabled tray item ${label}`);
      item.click();
    },
    trayItems: () => trayMenu?.items.map((i) => ({ label: i.label, enabled: i.enabled, type: i.type })),
    trayState: () => lastTray,
    metrics,
  };

// ---- boot ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerProtocol();
  app.on("second-instance", (_e, argv) => {
    const link = findDeepLink(argv);
    if (link) onDeepLink(link);
    else showWindow();
  });
  app.on("open-url", (e, url) => {
    e.preventDefault();
    const link = findDeepLink([url]);
    if (link) onDeepLink(link);
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("window-all-closed", () => {
    /* stay alive in the tray */
  });
  app.on("will-quit", () => void stopServer().then(() => engine?.close()));

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    nativeTheme.themeSource = config.theme;
    registerIpc();
    state.onBattery = powerMonitor.isOnBatteryPower();
    const onPower = (battery: boolean) => {
      state.onBattery = battery;
      applyMemory(server, config, battery);
      publish();
    };
    powerMonitor.on("on-battery", () => onPower(true));
    powerMonitor.on("on-ac", () => onPower(false));
    watchPairing(
      state.pairing,
      () => state.token,
      () => state.port,
      () => {
        if (state.pairing.firstSeenMs === state.pairing.lastSeenMs) addActivity("pair", "Browser paired", "An extension made its first call.");
        publish();
      },
    );
    createTray();
    const boot = findDeepLink(process.argv);
    const hidden = config.setupDone && (process.argv.includes("--hidden") || (config.startMinimized && app.getLoginItemSettings().wasOpenedAtLogin));
    createWindow(hidden && !boot);
    await startServer(process.env.SPEAKKIT_TOKEN || undefined);
    if (boot?.kind === "pair") sendUi({ type: "nav", page: "browser" });
    publish();
  });
}
