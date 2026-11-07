import { app, clipboard, shell } from "electron";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dirSize, measureDownloads } from "./downloads";
import type { Activity, Api, AppState, ExternalLink, Metrics, Method, StorageInfo } from "../shared/ipc";
import { applyMemory } from "../shared/memory";
import type { Config, ConfigPatch } from "../shared/schemas";
import type { MainWindow } from "./main-window";
import { emptyPairing } from "./pairing";
import type { ServerApi } from "./server-api";
import type { ServerRuntime } from "./server-lifecycle";

interface HandlerDeps {
  state: AppState;
  config: Config;
  saveConfig(): void;
  publish(): AppState;
  runtime: ServerRuntime;
  mainWindow: MainWindow;
  api: ServerApi;
  dataDir: string;
  modelsDir: string;
  logsDir: string;
  addActivity(kind: Activity["kind"], title: string, body: string): void;
  /** Settings changes the desktop features react to (Do Not Disturb). */
  onConfigPatch(patch: ConfigPatch): void;
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

export { metrics };

/** The only addresses the renderer can make the app open. The microphone page of the OS settings exists on Windows and macOS. */
const EXTERNAL_URLS: Record<ExternalLink, string | undefined> = {
  webstore: "https://chromewebstore.google.com/search/SpeakKit",
  "microphone-settings": ({ win32: "ms-settings:privacy-microphone", darwin: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone" } as Partial<Record<string, string>>)[process.platform],
};

const loginItemArgs = (config: Config) => (config.startMinimized ? ["--hidden"] : []);

async function patchConfig(d: HandlerDeps, patch: ConfigPatch) {
  const { state, config, runtime, mainWindow } = d;
  const setupWas = config.setupDone;
  Object.assign(config, patch);
  d.saveConfig();
  if (patch.startMinimized !== undefined) app.setLoginItemSettings({ openAtLogin: app.getLoginItemSettings().openAtLogin, args: loginItemArgs(config) });
  if (patch.idleUnload || patch.batterySaver !== undefined) applyMemory(runtime.server, config, state.onBattery);
  if (patch.loadAtStart && runtime.engine?.status().state === "unloaded") runtime.startEngine();
  d.onConfigPatch(patch);
  if (config.setupDone !== setupWas) mainWindow.applyMode();
  return d.publish();
}

async function regenerateToken(d: HandlerDeps) {
  const token = randomBytes(32).toString("hex");
  await writeFile(path.join(d.dataDir, "token"), token);
  Object.assign(d.state.pairing, emptyPairing());
  d.addActivity("info", "Pairing token regenerated", "Every paired browser must be paired again.");
  return d.runtime.restart(token);
}

async function storageInfo(d: HandlerDeps): Promise<StorageInfo> {
  const [sizes, logsBytes, all] = await Promise.all([measureDownloads(d.dataDir, d.modelsDir), dirSize(d.logsDir), dirSize(d.dataDir)]);
  const { modelsBytes, enginesBytes, cacheBytes } = sizes;
  // A models folder set by SPEAKKIT_MODELS_DIR lies outside the data folder and is not part of its total.
  const inside = (d.modelsDir.startsWith(d.dataDir) ? modelsBytes : 0) + enginesBytes + cacheBytes;
  return { modelsDir: d.modelsDir, logsDir: d.logsDir, modelsBytes, enginesBytes, cacheBytes, logsBytes, otherBytes: Math.max(0, all - inside - logsBytes) };
}

/** The IPC methods of the app shell: settings, server and engine control, storage. The desktop features add their own. */
export function createAppHandlers(d: HandlerDeps) {
  const { state, config, runtime, mainWindow } = d;
  const loginArgs = () => loginItemArgs(config);

  return {
    state: async () => d.publish(),
    patchConfig: (patch) => patchConfig(d, patch),
    setLaunchAtLogin: async (on) => {
      app.setLoginItemSettings({ openAtLogin: on, args: loginArgs() });
      return d.publish();
    },
    setPort: async (port) => {
      config.preferredPort = port;
      d.saveConfig();
      return runtime.restart(state.token);
    },
    regenerateToken: () => regenerateToken(d),
    retryEngine: () => runtime.retry(),
    downloadModel: async () => {
      const engine = runtime.engine ?? runtime.createEngine();
      const st = engine.status().state;
      if (st === "missing" || st === "error") runtime.startEngine();
      await runtime.refreshHealth();
      return d.publish();
    },
    voices: () => d.api.voices(),
    preview: (voice, text, speed = 1) => d.api.speak({ text, voice, speed }),
    copy: async (text) => clipboard.writeText(text),
    openExternal: async (link) => {
      const url = EXTERNAL_URLS[link];
      if (url) await shell.openExternal(url);
    },
    openPath: async (which) => {
      const dir = which === "models" ? d.modelsDir : d.logsDir;
      await mkdir(dir, { recursive: true });
      await shell.openPath(dir);
    },
    storage: () => storageInfo(d),
    deleteDownloads: async () => {
      const report = await runtime.removeDownloads();
      d.addActivity("info", "Downloaded models removed", report.failed.length ? "Some files could not be removed." : "Voice models and engines were deleted from this computer.");
      return report;
    },
    metrics: async () => metrics(),
    hideWindow: async () => mainWindow.hide(),
    quit: async () => mainWindow.quit(),
  } satisfies Partial<{ [K in Method]: Api[K] }>;
}
