import { app, clipboard, shell } from "electron";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dirSize, measureDownloads } from "./downloads";
import { isLaunchAtLogin, setLaunchAtLogin } from "./login-item";
import type { AreaName } from "../shared/control/settings-registry";
import type { Activity, Api, AppState, ExternalLink, Metrics, Method, StorageInfo } from "../shared/ipc";
import { applyMemory } from "../shared/memory";
import type { DictationStatus } from "../shared/dictation/contract";
import type { DictationPatch } from "../shared/dictation/settings";
import type { Config, ConfigPatch } from "../shared/schemas";
import type { MainWindow } from "./main-window";
import { emptyPairing } from "./pairing";
import { applyChange, importSettings, type ChangeTargets } from "./settings-change";
import { SETTINGS_LINKS, createSettingsHandlers } from "./settings-handlers";
import type { ServerApi } from "./server-api";
import type { ServerRuntime } from "./server-lifecycle";
import { voiceChatHandlers } from "./voice-chat/handlers";
import type { VoiceChat } from "./voice-chat/service";

export interface HandlerDeps {
  state: AppState;
  config: Config;
  saveConfig(): void;
  publish(): AppState;
  runtime: ServerRuntime;
  mainWindow: MainWindow;
  api: ServerApi;
  voiceChat: VoiceChat;
  dataDir: string;
  modelsDir: string;
  logsDir: string;
  addActivity(kind: Activity["kind"], title: string, body: string): void;
  /** Settings changes the desktop features react to (Do Not Disturb). */
  onConfigPatch(patch: ConfigPatch): void;
  /** Dictation settings, stored by the dictation feature; the shortcut it clashes with when refused. */
  patchDictation(patch: DictationPatch): Promise<DictationStatus["rejected"]>;
  /** The settings of capture, transcripts, meetings and engines, stored by the feature that owns them. */
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  setShortcut: Api["setShortcut"];
  resetShortcuts(): Promise<unknown>;
  /** The settings file the person picks to import; null when cancelled. */
  pickSettingsFile(): Promise<string | null>;
  /** Asks whether an import may apply settings that reach beyond the app (their plain names); false leaves them out. */
  confirmImport(what: string[]): Promise<boolean>;
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

/** The only addresses the renderer can make the app open. */
const EXTERNAL_URLS: Record<ExternalLink, string> = {
  webstore: "https://chromewebstore.google.com/search/SpeakKit",
  ...SETTINGS_LINKS,
};

/** What a changed setting does besides being stored: login item, memory rules, the feature that owns it, the window mode. */
function applyConfigChange(d: HandlerDeps, patch: ConfigPatch, setupWas: boolean) {
  const { state, config, runtime, mainWindow } = d;
  if (patch.startMinimized !== undefined && isLaunchAtLogin(!config.startMinimized)) setLaunchAtLogin(true, config.startMinimized);
  if (patch.idleUnload || patch.batterySaver !== undefined) applyMemory(runtime.server, config, state.onBattery);
  if (patch.loadAtStart && runtime.engine?.status().state === "unloaded") runtime.startEngine();
  d.onConfigPatch(patch);
  if (config.setupDone !== setupWas) mainWindow.applyMode();
  return d.publish();
}

async function patchConfig(d: HandlerDeps, patch: ConfigPatch) {
  const setupWas = d.config.setupDone;
  Object.assign(d.config, patch);
  d.saveConfig();
  return applyConfigChange(d, patch, setupWas);
}

function applyLaunchAtLogin(d: HandlerDeps, on: boolean) {
  setLaunchAtLogin(on, d.config.startMinimized);
  return d.publish();
}

function applyPort(d: HandlerDeps, port: number) {
  d.config.preferredPort = port;
  d.saveConfig();
  return d.runtime.restart(d.state.token);
}

const changeTargets = (d: HandlerDeps): ChangeTargets => ({
  patchDictation: d.patchDictation,
  patchApp: (p) => patchConfig(d, p),
  patchArea: d.patchArea,
  setShortcut: d.setShortcut,
  resetShortcuts: d.resetShortcuts,
  setLaunchAtLogin: async (on) => applyLaunchAtLogin(d, on),
  setVoiceChatVoice: (voice) => (d.voiceChat.setVoice(voice), void d.publish()),
  setPort: async (port) => applyPort(d, port),
});

/** The settings file was edited outside the app: take the new values (they are already in the file, so nothing is saved). */
export function applyExternalConfig(d: HandlerDeps, patch: Partial<Config>) {
  const setupWas = d.config.setupDone;
  Object.assign(d.config, patch);
  return applyConfigChange(d, patch as ConfigPatch, setupWas);
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
  const { modelsBytes, cacheBytes } = sizes;
  // A models folder set by SPEAKKIT_MODELS_DIR lies outside the data folder and is not part of its total.
  const inside = (d.modelsDir.startsWith(d.dataDir) ? modelsBytes : 0) + cacheBytes;
  return { modelsDir: d.modelsDir, logsDir: d.logsDir, modelsBytes, cacheBytes, logsBytes, otherBytes: Math.max(0, all - inside - logsBytes) };
}

/** The IPC methods of the app shell: settings, server and engine control, storage. The desktop features add their own. */
export function createAppHandlers(d: HandlerDeps) {
  const { runtime, mainWindow } = d;

  return {
    state: async () => d.publish(),
    applySettings: (change) => applyChange(changeTargets(d), change),
    importSettings: () => importSettings({ pick: d.pickSettingsFile, read: (f) => readFile(f, "utf8"), current: () => d.config, confirm: d.confirmImport }, changeTargets(d)),
    setLaunchAtLogin: async (on) => applyLaunchAtLogin(d, on),
    setPort: async (port) => applyPort(d, port),
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
      const dir = { models: d.modelsDir, data: d.dataDir, logs: d.logsDir }[which];
      await mkdir(dir, { recursive: true });
      await shell.openPath(dir);
    },
    storage: () => storageInfo(d),
    deleteDownloads: async () => {
      const report = await runtime.removeDownloads();
      d.addActivity("info", "Downloaded models removed", report.failed.length ? "Some files could not be removed." : "The voice model was deleted from this computer.");
      return report;
    },
    metrics: async () => metrics(),
    ...voiceChatHandlers(d.voiceChat),
    ...createSettingsHandlers(d),
    hideWindow: async () => mainWindow.hide(),
    quit: async () => mainWindow.quit(),
  } satisfies Partial<{ [K in Method]: Api[K] }>;
}
