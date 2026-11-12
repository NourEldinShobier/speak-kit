import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Health } from "@speakkit/protocol";
import type { DownloadsReport } from "../shared/app-data";
import { toDesktopError } from "../shared/errors";
import { createServer, type AutomationHost, type VoiceChatService } from "@speakkit/server";
import { FakeEngine, KokoroEngine, type TtsEngine } from "@speakkit/engine";
import type { AppState } from "../shared/ipc";
import { applyMemory, serverOptions } from "../shared/memory";
import type { Config } from "../shared/schemas";
import type { Logger } from "./context";
import { removeDownloads } from "./downloads";
import { listenWithFallback } from "./ports";
import type { ServerApi } from "./server-api";

type Srv = Awaited<ReturnType<typeof listenWithFallback<ReturnType<typeof createServer>>>>["server"];
type EngineState = Health["engine"]["state"];

interface RuntimeDeps {
  state: AppState;
  config: Config;
  dataDir: string;
  modelsDir: string;
  /** The model host: dist/worker/worker.js when built, the engine package's source file in development (see engineWorkerUrl). */
  engineWorker: URL;
  log: Logger;
  api: ServerApi;
  /** The OpenAI key and the minting of Realtime client secrets; the server only calls it. */
  voiceChat: VoiceChatService;
  /** The reader, queue and exports lent to scripts and AI apps. */
  automation: AutomationHost;
  /** Sends the state to every window. */
  publish(): AppState;
  /** Health is polled only while the main window is visible. */
  isVisible(): boolean;
  /** The engine changed state: lets the desktop features announce a finished download or a failure. */
  onEngineState(prev: EngineState | undefined, next: EngineState, detail: string | undefined): void;
}

/** The engine module is bundled into dist/main: its worker is the built file (packaged) or the source file (development). */
export async function engineWorkerUrl(distDir: string): Promise<URL> {
  const built = path.join(distDir, "../worker/worker.js");
  return access(built).then(
    () => pathToFileURL(built),
    () => new URL("./worker.ts", import.meta.resolve("@speakkit/engine")),
  );
}

/** The local server and its engines: creation, restart, shutdown, and the health state the UI shows. */
export class ServerRuntime {
  #d: RuntimeDeps;
  #server: Srv | null = null;
  #engine: TtsEngine | null = null; // outlives token/port changes; recreated on retry
  #firstEngine = true;
  #keepMissing = false; // after the person deleted the models, do not fetch them again until asked
  #unsubEngine: (() => void) | null = null;
  #lastEngineState: EngineState | undefined;
  #healthTimer: NodeJS.Timeout | undefined;

  constructor(deps: RuntimeDeps) {
    this.#d = deps;
  }

  get server(): Srv | null {
    return this.#server;
  }

  get engine(): TtsEngine | null {
    return this.#engine;
  }

  /** Creates the engine without loading anything. The model is downloaded on request (setup) or loaded on first play (server). */
  createEngine(): TtsEngine {
    this.#unsubEngine?.();
    const engine = (this.#engine = this.#newEngine());
    this.#firstEngine = false;
    this.#lastEngineState = engine.status().state;
    this.#unsubEngine = engine.onStatus(() => void this.#onEngineEvent());
    // Setup finished but the model is gone: fetch it again. Otherwise stay lazy unless the user asked for load at startup.
    const refetch = this.#d.config.setupDone && engine.status().state === "missing" && !this.#keepMissing;
    this.#keepMissing = false;
    if (this.#d.config.loadAtStart || refetch) this.startEngine();
    return engine;
  }

  startEngine(): void {
    this.#engine?.start().catch((e) => this.#d.log.warn("engine start failed", e instanceof Error ? e.message : e)); // reported through status -> /v1/health
  }

  async stop(): Promise<void> {
    const s = this.#server;
    this.#server = null;
    this.#d.state.port = 0;
    await s?.close();
  }

  async start(token?: string): Promise<void> {
    const { state, config, dataDir, log } = this.#d;
    state.serverError = null;
    try {
      const engine = this.#engine ?? this.createEngine();
      const { server, port } = await listenWithFallback(config.preferredPort, (port) =>
        createServer({
          engine,
          dataDir,
          port,
          version: state.version,
          voiceChat: this.#d.voiceChat,
          automation: this.#d.automation,
          ...(token ? { token } : {}),
          onError: (e) => this.#onServerError(e),
          // Lazy-load options of the server build; extra keys are ignored by a build that predates them.
          ...serverOptions(config),
        }),
      );
      this.#server = server;
      state.port = port;
      state.portFallback = port !== config.preferredPort;
      state.token = server.token;
      const missing = applyMemory(server, config, state.onBattery);
      if (missing.length) log.info("server has no runtime setter for:", missing.join(", "));
      log.info(`server listening on 127.0.0.1:${port}`);
      // The command line tool finds the port here, also after a port fallback.
      await writeFile(path.join(dataDir, "server.json"), JSON.stringify({ port })).catch((e) => log.warn("server.json not written", e instanceof Error ? e.message : e));
    } catch (e) {
      state.serverError = toDesktopError(e);
      log.error("server failed to start", e instanceof Error ? e.message : e);
    }
    await this.refreshHealth();
  }

  async restart(token?: string): Promise<AppState> {
    await this.stop();
    await this.start(token);
    return this.#d.publish();
  }

  /** Drops the engine and starts over (Retry after an error). */
  async retry(): Promise<AppState> {
    await this.stop();
    await this.#engine?.close().catch(() => {}); // the engine is replaced anyway; a failed close leaves nothing to keep
    this.#engine = null;
    await this.start(this.#d.state.token || undefined);
    this.startEngine();
    return this.#d.publish();
  }

  /**
   * Settings > Storage > Delete downloaded models: stops the server and the engine (its files are open while it runs), deletes the
   * downloads, then starts again with the engine in the "missing" state. The library and settings stay.
   */
  async removeDownloads(): Promise<DownloadsReport> {
    await this.stop();
    await this.#engine?.close().catch((e) => this.#d.log.warn("engine close failed", e instanceof Error ? e.message : e));
    this.#engine = null;
    const report = await removeDownloads(this.#d.dataDir, this.#d.modelsDir);
    this.#keepMissing = true;
    await this.start(this.#d.state.token || undefined);
    this.#d.publish();
    return report;
  }

  async shutdown(): Promise<void> {
    await this.stop();
    await this.#engine?.close();
  }

  /** Health is fetched on engine events and, while the window is visible, on a timer; never polled while hidden. */
  async refreshHealth(): Promise<void> {
    const { state, api } = this.#d;
    const health = state.port ? await api.health(AbortSignal.timeout(2000)).catch(() => null) : null; // null: server busy or stopped
    if (JSON.stringify(health) !== JSON.stringify(state.health)) {
      state.health = health;
      this.#d.publish();
    }
    this.stopPolling();
    if (this.#d.isVisible()) {
      const s = health?.engine.state;
      this.#healthTimer = setTimeout(() => void this.refreshHealth(), s === "loading" || s === "downloading" || !health ? 700 : 5000);
    }
  }

  stopPolling(): void {
    clearTimeout(this.#healthTimer);
    this.#healthTimer = undefined;
  }

  /** The node server raised an error after it was listening: shown like a failed start, and logged. */
  #onServerError(e: Error): void {
    this.#d.state.serverError = toDesktopError(e);
    this.#d.log.error("server error", e.message);
    this.#d.publish();
  }

  async #onEngineEvent(): Promise<void> {
    await this.refreshHealth();
    const next = this.#engine?.status();
    if (!next) return;
    this.#d.onEngineState(this.#lastEngineState, next.state, next.detail);
    this.#lastEngineState = next.state;
  }

  #newEngine(): TtsEngine {
    if (process.env.SPEAKKIT_ENGINE === "fake") {
      // Test hook: the first engine starts in the given state (e.g. error); a retry gets a healthy one.
      const forced = this.#firstEngine ? (process.env.SPEAKKIT_FAKE_STATE as "downloading" | "error" | "unloaded" | undefined) : undefined;
      const e = new FakeEngine({ latencyMs: Number(process.env.SPEAKKIT_FAKE_LATENCY_MS ?? 0), ...(forced ? { state: forced } : {}) });
      if (forced === "downloading" || forced === "error") {
        e.setStatus({ state: forced, progress: 0.62, detail: "huggingface.co, connection reset (ECONNRESET)" });
        e.start = async () => {};
      }
      return e;
    }
    return new KokoroEngine({ modelsDir: this.#d.modelsDir, workerUrl: this.#d.engineWorker });
  }
}
