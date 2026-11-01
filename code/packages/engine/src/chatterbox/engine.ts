import { existsSync } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_RATE, type EngineReason, type EngineState, type Voice } from "@speakkit/protocol";
import { LifecycleEngine, type LifecycleOptions } from "../lifecycle";
import { splitLong } from "../split";
import { EngineNotReadyError, EngineUnavailableError, type SynthOptions, type Synthesized } from "../types";
import { detectHardware, MIN_VRAM_MB, type Hardware } from "./detect";
import { envPython, pipInstall, type InstallContext } from "./install";
import { Sidecar } from "./sidecar";
import { ClonedVoiceStore } from "./voice-store";

export type { InstallContext } from "./install";

const CHATTERBOX_VOICE = "chatterbox";
const DEFAULT_VOICE: Voice = { id: CHATTERBOX_VOICE, name: "Chatterbox", lang: "en-US", gender: "female", quality: "A" };
const GAP_SAMPLES = Math.round(SAMPLE_RATE * 0.08);
const MARKER = "installed";

export interface ChatterboxOptions extends LifecycleOptions {
  /** `<dataDir>/chatterbox`: holds `env/` (virtualenv), `hf/` (weights), `installed`. */
  dir: string;
  /** `<dataDir>/voices`: cloned reference clips. */
  voicesDir: string;
  /** Detected hardware (default: nvidia-smi and python probes). */
  hardware?: Hardware;
  /** Replaces `<env python> chatterbox_sidecar.py`; tests point it at a fake sidecar. */
  sidecar?: { command: string; args: string[] };
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
  #sidecar: Sidecar | undefined;

  /** Detects the hardware first, so the initial state is right. */
  static async create(o: ChatterboxOptions): Promise<ChatterboxEngine> {
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

  async #install(): Promise<void> {
    const s = this.status();
    if (s.state !== "missing") {
      if (s.state === "unavailable") throw new EngineUnavailableError(s.detail ?? "Chatterbox cannot run here", this.#reason);
      return; // already installed
    }
    const ctx: InstallContext = {
      dir: this.#o.dir,
      ...(this.#hw.python && { python: this.#hw.python }),
      ...(this.#hw.uv && { uv: this.#hw.uv }),
      envDir: join(this.#o.dir, "env"),
      ...(this.#o.deadlines?.installIdleMs !== undefined && { idleMs: this.#o.deadlines.installIdleMs }),
      progress: (progress, detail) => this.setStatus({ state: "installing", progress, ...(detail !== undefined && { detail }) }),
    };
    ctx.progress(0);
    try {
      await mkdir(this.#o.dir, { recursive: true });
      await (this.#o.installer ?? pipInstall)(ctx);
      await writeFile(join(this.#o.dir, MARKER), new Date().toISOString());
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await rm(ctx.envDir, { recursive: true, force: true });
      this.setStatus({ state: "missing", detail });
      throw e;
    }
    this.#reason = undefined;
    this.setStatus({ state: "unloaded" });
  }

  /** Deletes the environment and downloaded weights; cloned voices stay. */
  async remove(): Promise<void> {
    await this.#installing?.catch(() => {});
    await this.release();
    if (this.status().state === "ready") throw new Error("engine is busy");
    for (const f of ["env", "hf", MARKER]) await rm(join(this.#o.dir, f), { recursive: true, force: true });
    this.#applyAssessment(false);
  }

  protected async doLoad(): Promise<void> {
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
    });
    this.#sidecar = sidecar;
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
    for (const piece of splitLong(text, 250)) {
      signal?.throwIfAborted();
      if (parts.length) parts.push(new Int16Array(GAP_SAMPLES));
      const r = await sidecar.synth(piece, reference, signal);
      sampleRate = r.sampleRate;
      parts.push(r.pcm);
    }
    return { pcm: concat(parts), sampleRate };
  }
}
