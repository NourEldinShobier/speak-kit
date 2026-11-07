import { existsSync } from "node:fs";
import { access, mkdir, rm, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_RATE, type EngineReason, type EngineState, type Voice } from "@speakkit/protocol";
import { LifecycleEngine, type LifecycleOptions } from "../lifecycle";
import { splitLong } from "../split";
import { EngineFailure, EngineNotReadyError, EngineUnavailableError, InstallCancelledError, type SynthOptions, type Synthesized } from "../types";
import { detectHardware, MIN_VRAM_MB, type Hardware } from "./detect";
import { envPython, isDiskFull, pipInstall, type InstallContext } from "./install";
import { Sidecar } from "./sidecar";
import { ClonedVoiceStore } from "./voice-store";

export type { InstallContext } from "./install";

const CHATTERBOX_VOICE = "chatterbox";
const DEFAULT_VOICE: Voice = { id: CHATTERBOX_VOICE, name: "Chatterbox", lang: "en-US", gender: "female", quality: "A" };
const GAP_SAMPLES = Math.round(SAMPLE_RATE * 0.08);
const MARKER = "installed";
/** Exists from the start of an install until it ends; one found at start-up means the app died mid-install. */
const INSTALLING = "installing";
const GB = 1024 ** 3;
/** CUDA torch (2.5 GB), its libraries, chatterbox-tts and the 3 GB of weights, with room for pip's temporary files. */
const MIN_FREE_BYTES = 10 * GB;
const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;
const gb = (bytes: number) => `${Math.round((bytes / GB) * 10) / 10} GB`;

export interface ChatterboxOptions extends LifecycleOptions {
  /** `<dataDir>/chatterbox`: holds `env/` (virtualenv), `hf/` (weights), `installed`. */
  dir: string;
  /** `<dataDir>/voices`: cloned reference clips. */
  voicesDir: string;
  /** Detected hardware (default: nvidia-smi and python probes). */
  hardware?: Hardware;
  /** Replaces `<env python> chatterbox_sidecar.py`; tests point it at a fake sidecar. */
  sidecar?: { command: string; args: string[] };
  /** Free bytes on the drive that holds `dir` (default: `statfs`); tests inject it. */
  freeBytes?: (dir: string) => Promise<number>;
  /** Replaces the venv + pip install; tests use a fake. */
  installer?: (ctx: InstallContext) => Promise<void>;
  /** Location of chatterbox_sidecar.py (default: next to this package). */
  sidecarScript?: string;
  /** Heartbeat deadlines in ms; defaults: 120 s for an installer step, 120 s while the sidecar loads, 60 s for a synthesis request. */
  deadlines?: { installIdleMs?: number; loadIdleMs?: number; requestIdleMs?: number };
}

function assess(hw: Hardware, installed: boolean): { state: EngineState; reason?: EngineReason; detail?: string } {
  if (!hw.gpu) return { state: "unavailable", reason: "no-gpu", detail: "Chatterbox needs an NVIDIA GPU." };
  if (hw.gpu.vramMb < MIN_VRAM_MB) return { state: "unavailable", reason: "no-gpu", detail: `${hw.gpu.name} has ${hw.gpu.vramMb} MB; Chatterbox needs ${MIN_VRAM_MB} MB.` };
  if (installed) return { state: "unloaded" };
  if (!hw.python && !hw.uv) return { state: "unavailable", reason: "python-missing", detail: "Python 3.10 to 3.12 (or uv) is required." };
  return { state: "missing", reason: "not-installed" };
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

async function defaultScript(): Promise<string> {
  for (const rel of ["../../sidecar/chatterbox_sidecar.py", "../sidecar/chatterbox_sidecar.py"]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (await exists(p)) return p;
  }
  throw new Error("chatterbox_sidecar.py not found; pass sidecarScript");
}

/** Concatenates PCM pieces. */
function concat(parts: Int16Array[]): Int16Array {
  const pcm = new Int16Array(parts.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of parts) {
    pcm.set(a, at);
    at += a.length;
  }
  return pcm;
}

/**
 * Chatterbox (zero-shot voice cloning) through a Python sidecar process that exists only while the model is loaded.
 * The sidecar speaks JSON lines on stdin/stdout; see sidecar.ts and sidecar/chatterbox_sidecar.py. States beyond the base lifecycle:
 * `unavailable` (no GPU / no Python, see info().reason), `missing` (installable), `installing`, `downloading` (weights).
 */
export class ChatterboxEngine extends LifecycleEngine {
  readonly needsNumberWords = true;
  readonly clones: ClonedVoiceStore;
  #o: ChatterboxOptions;
  #hw: Hardware;
  #reason: EngineReason | undefined;
  #installing: Promise<void> | undefined;
  #cancel: AbortController | undefined;
  #sidecar: Sidecar | undefined;

  /** Detects the hardware first, so the initial state is right, and removes what an install killed with the app left behind. */
  static async create(o: ChatterboxOptions): Promise<ChatterboxEngine> {
    if (await exists(join(o.dir, INSTALLING))) {
      // `installed` is written before `installing` is removed, so both present means a finished install the app died after
      if (await exists(join(o.dir, MARKER))) await rm(join(o.dir, INSTALLING), RM);
      else await Promise.all([rm(join(o.dir, "env"), RM), rm(join(o.dir, INSTALLING), RM)]);
    }
    return new ChatterboxEngine(o, o.hardware ?? (await detectHardware()));
  }

  constructor(o: ChatterboxOptions, hw: Hardware) {
    // oxlint-disable-next-line node/no-sync -- startup: the install marker decides the initial state, once
    const a = assess(hw, existsSync(join(o.dir, MARKER)));
    super(o, a.state);
    this.#o = o;
    this.#hw = hw;
    this.#reason = a.reason;
    this.clones = new ClonedVoiceStore(o.voicesDir);
    if (a.detail) this.setStatus({ state: a.state, detail: a.detail });
  }

  info() {
    return { ...(this.#reason && { reason: this.#reason }), ...(this.#hw.gpu && { gpu: this.#hw.gpu }) };
  }

  voices(): Voice[] {
    return [DEFAULT_VOICE, ...this.clones.voices()];
  }

  /** Process id of the running sidecar, for tests and diagnostics. */
  get sidecarPid(): number | undefined {
    return this.#sidecar?.pid;
  }

  /** Re-runs the hardware check, e.g. after the user installed Python. */
  async refresh(): Promise<void> {
    const s = this.status().state;
    if (s !== "unavailable" && s !== "missing") return;
    this.#hw = await detectHardware();
    this.#applyAssessment(false);
  }

  #applyAssessment(installed: boolean): void {
    const a = assess(this.#hw, installed);
    this.#reason = a.reason;
    this.setStatus({ state: a.state, ...(a.detail && { detail: a.detail }) });
  }

  override start(): Promise<void> {
    const s = this.status().state;
    if (s === "missing" || s === "unavailable" || s === "installing") return Promise.reject(new EngineNotReadyError(s));
    return super.start();
  }

  install(): Promise<void> {
    return (this.#installing ??= this.#install().finally(() => {
      this.#installing = undefined;
    }));
  }

  /** Stops a running install and waits until its processes are gone and the partial environment is deleted. */
  async cancelInstall(): Promise<void> {
    this.#cancel?.abort(new InstallCancelledError());
    try {
      await this.#installing;
    } catch {
      // the install reports its own failure through the status; cancel only waits for it to end
    }
  }

  async #requireDisk(): Promise<void> {
    const dir = this.#o.dir;
    const free = await (this.#o.freeBytes ?? ((d) => statfs(d).then((f) => Number(f.bavail) * Number(f.bsize))))(dir);
    if (free < MIN_FREE_BYTES) throw new EngineFailure(`Chatterbox needs ${gb(MIN_FREE_BYTES)} of free disk space and ${gb(free)} is free.`, "disk-full");
  }

  async #install(): Promise<void> {
    const s = this.status();
    if (s.state !== "missing") {
      if (s.state === "unavailable") throw new EngineUnavailableError(s.detail ?? "Chatterbox cannot run here", this.#reason);
      return; // already installed
    }
    const cancel = (this.#cancel = new AbortController());
    const ctx: InstallContext = {
      dir: this.#o.dir,
      ...(this.#hw.python && { python: this.#hw.python }),
      ...(this.#hw.uv && { uv: this.#hw.uv }),
      envDir: join(this.#o.dir, "env"),
      ...(this.#o.deadlines?.installIdleMs !== undefined && { idleMs: this.#o.deadlines.installIdleMs }),
      signal: cancel.signal,
      progress: (progress, detail) => this.setStatus({ state: "installing", progress, ...(detail !== undefined && { detail }) }),
    };
    ctx.progress(0);
    try {
      await mkdir(this.#o.dir, { recursive: true });
      await this.#requireDisk();
      await writeFile(join(this.#o.dir, INSTALLING), new Date().toISOString());
      cancel.signal.throwIfAborted();
      await (this.#o.installer ?? pipInstall)(ctx);
      cancel.signal.throwIfAborted();
      await writeFile(join(this.#o.dir, MARKER), new Date().toISOString());
    } catch (e) {
      await this.#abandonInstall(e, cancel.signal.aborted);
      throw e;
    } finally {
      this.#cancel = undefined;
    }
    try {
      await rm(join(this.#o.dir, INSTALLING), RM);
    } catch {
      // the build is complete: a marker that cannot be removed now is cleaned up at the next start (see create), not a reason to fail
    }
    this.#reason = undefined;
    this.setStatus({ state: "unloaded" });
  }

  /** A failed or cancelled install leaves no environment and no marker; the engine is installable again. */
  async #abandonInstall(e: unknown, cancelled: boolean): Promise<void> {
    await Promise.all([rm(join(this.#o.dir, "env"), RM), rm(join(this.#o.dir, INSTALLING), RM)]);
    const full = e instanceof EngineFailure ? e.reason === "disk-full" : isDiskFull(e);
    this.#reason = full && !cancelled ? "disk-full" : "not-installed";
    const detail = e instanceof Error ? e.message : String(e);
    this.setStatus(cancelled || e instanceof InstallCancelledError ? { state: "missing" } : { state: "missing", detail });
  }

  /** Deletes the environment and downloaded weights; cloned voices stay. */
  async remove(): Promise<void> {
    await this.#installing?.catch(() => {}); // an install that failed has nothing left running to wait for
    await this.release();
    if (this.status().state === "ready") throw new Error("engine is busy");
    for (const f of ["env", "hf", MARKER]) await rm(join(this.#o.dir, f), { recursive: true, force: true });
    this.#applyAssessment(false);
  }

  protected async doLoad(): Promise<void> {
    this.#reason = undefined;
    const { command, args } = this.#o.sidecar ?? {
      command: envPython(join(this.#o.dir, "env")),
      args: [this.#o.sidecarScript ?? (await defaultScript())],
    };
    const { loadIdleMs, requestIdleMs } = this.#o.deadlines ?? {};
    const sidecar = await Sidecar.start({
      command,
      args,
      hfHome: join(this.#o.dir, "hf"),
      ...(loadIdleMs !== undefined && { loadIdleMs }),
      ...(requestIdleMs !== undefined && { requestIdleMs }),
      onProgress: (s) => this.report(s),
      onCrash: (message) => {
        if (this.#sidecar !== sidecar) return;
        this.#sidecar = undefined;
        this.markUnloaded(message);
      },
    }).catch((e) => {
      if (e instanceof EngineFailure) this.#reason = e.reason;
      throw e;
    });
    this.#sidecar = sidecar;
  }

  /** The GPU ran out of memory: end the process (its memory goes back to the GPU) and let the next request load a fresh one. Not counted as a crash. */
  async #outOfMemory(e: EngineFailure): Promise<void> {
    const sidecar = this.#sidecar;
    this.#sidecar = undefined;
    await sidecar?.stop();
    this.#reason = e.reason;
    this.setStatus({ state: "unloaded", detail: e.message });
  }

  override async close(): Promise<void> {
    await this.cancelInstall();
    await super.close();
  }

  protected async doUnload(): Promise<void> {
    const sidecar = this.#sidecar;
    this.#sidecar = undefined;
    await sidecar?.stop();
  }

  protected async doSynthesize(text: string, { voice, signal }: SynthOptions): Promise<Synthesized> {
    if (voice !== CHATTERBOX_VOICE && !this.clones.has(voice)) throw new Error(`unknown voice "${voice}"`);
    const sidecar = this.#sidecar;
    if (!sidecar) throw new Error("sidecar is not running");
    const reference = this.clones.has(voice) ? this.clones.path(voice) : null;
    const parts: Int16Array[] = [];
    let sampleRate = SAMPLE_RATE;
    try {
      for (const piece of splitLong(text, 250)) {
        signal?.throwIfAborted();
        if (parts.length) parts.push(new Int16Array(GAP_SAMPLES));
        const r = await sidecar.synth(piece, { reference, ...this.clones.style(voice) }, signal);
        sampleRate = r.sampleRate;
        parts.push(r.pcm);
      }
    } catch (e) {
      if (e instanceof EngineFailure && e.reason === "out-of-memory") await this.#outOfMemory(e);
      throw e;
    }
    return { pcm: concat(parts), sampleRate };
  }
}
