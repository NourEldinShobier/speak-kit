import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as v from "valibot";
import { SAMPLE_RATE, type EngineReason, type EngineState, type Voice } from "@speakkit/protocol";
import { LifecycleEngine, type LifecycleOptions } from "../lifecycle";
import { splitLong } from "../split";
import { EngineNotReadyError, EngineUnavailableError, type SynthOptions, type Synthesized } from "../types";
import { detectHardware, MIN_VRAM_MB, type Hardware } from "./detect";
import { ClonedVoiceStore } from "./voice-store";

const CHATTERBOX_VOICE = "chatterbox";
const DEFAULT_VOICE: Voice = { id: CHATTERBOX_VOICE, name: "Chatterbox", lang: "en-US", gender: "female", quality: "A" };
const GAP_SAMPLES = Math.round(SAMPLE_RATE * 0.08);
const MARKER = "installed";

export interface InstallContext {
  /** Engine directory (`<dataDir>/chatterbox`). */
  dir: string;
  /** System Python 3.10 to 3.12, when one exists. */
  python?: string[];
  /** uv, which downloads Python 3.11 itself; preferred over `python`. */
  uv?: string[];
  /** Directory the virtual environment is created in. */
  envDir: string;
  progress(fraction: number, detail?: string): void;
}

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
}

const Message = v.variant("kind", [
  v.object({ kind: v.literal("progress"), phase: v.picklist(["downloading", "loading"]), progress: v.optional(v.number()), detail: v.optional(v.string()) }),
  v.object({ kind: v.literal("ready") }),
  v.object({ kind: v.literal("fatal"), message: v.string() }),
  v.object({ kind: v.literal("audio"), id: v.number(), sampleRate: v.number(), pcm: v.string() }),
  v.object({ kind: v.literal("error"), id: v.number(), message: v.string() }),
]);

function assess(hw: Hardware, installed: boolean): { state: EngineState; reason?: EngineReason; detail?: string } {
  if (!hw.gpu) return { state: "unavailable", reason: "no-gpu", detail: "Chatterbox needs an NVIDIA GPU." };
  if (hw.gpu.vramMb < MIN_VRAM_MB) return { state: "unavailable", reason: "no-gpu", detail: `${hw.gpu.name} has ${hw.gpu.vramMb} MB; Chatterbox needs ${MIN_VRAM_MB} MB.` };
  if (installed) return { state: "unloaded" };
  if (!hw.python && !hw.uv) return { state: "unavailable", reason: "python-missing", detail: "Python 3.10 to 3.12 (or uv) is required." };
  return { state: "missing", reason: "not-installed" };
}

function defaultScript(): string {
  for (const rel of ["../../sidecar/chatterbox_sidecar.py", "../sidecar/chatterbox_sidecar.py"]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(p)) return p;
  }
  throw new Error("chatterbox_sidecar.py not found; pass sidecarScript");
}

/** Runs a command to completion, feeding each stdout/stderr line to `onLine`. */
function runLines(cmd: string, args: string[], onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const tail: string[] = [];
    for (const s of [p.stdout, p.stderr])
      createInterface({ input: s }).on("line", (l) => {
        tail.push(l);
        if (tail.length > 8) tail.shift();
        onLine(l);
      });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}: ${tail.slice(-3).join(" | ")}`))));
  });
}

const envPython = (envDir: string) => join(envDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

// chatterbox-tts pins torch 2.6.0, whose Windows and default Linux wheels on PyPI are CPU-only; the CUDA build comes from this index.
const TORCH = ["torch==2.6.0", "torchaudio==2.6.0"];
const TORCH_INDEX = "https://download.pytorch.org/whl/cu124";
// perth (the watermarker chatterbox loads) imports pkg_resources, which setuptools 81 removed.
const PACKAGES = ["chatterbox-tts", "setuptools<81"];

/** Installs the CUDA torch build and chatterbox-tts into a private virtualenv. Progress is approximate: installers report no total, so each resolved package counts. */
async function pipInstall({ python, uv, envDir, progress }: InstallContext): Promise<void> {
  if (!uv && !python) throw new Error("no Python or uv to install with");
  const py = envPython(envDir);
  let seen = 0;
  const count = (l: string) => {
    if (/^(Collecting|Downloading| + )/.test(l)) progress(Math.min(0.95, 0.08 + (++seen / 120) * 0.87), l.trim().slice(0, 80));
  };
  progress(0.02, "Creating Python environment");
  const [bin, ...pre] = uv ?? python!;
  if (uv) {
    await runLines(bin!, [...pre, "venv", "--python", "3.11", envDir], () => {});
    progress(0.08, "Installing packages");
    await runLines(bin!, [...pre, "pip", "install", "--python", py, ...TORCH, "--index-url", TORCH_INDEX], count);
    await runLines(bin!, [...pre, "pip", "install", "--python", py, ...PACKAGES], count);
    return;
  }
  await runLines(bin!, [...pre, "-m", "venv", envDir], () => {});
  progress(0.08, "Installing packages");
  const pip = [py, "-m", "pip", "install", "--progress-bar", "off", "--disable-pip-version-check"];
  await runLines(pip[0]!, [...pip.slice(1), ...TORCH, "--index-url", TORCH_INDEX], count);
  await runLines(pip[0]!, [...pip.slice(1), ...PACKAGES], count);
}

/**
 * Chatterbox (zero-shot voice cloning) through a Python sidecar process that exists only while the model is loaded.
 * The sidecar speaks JSON lines on stdin/stdout; see sidecar/chatterbox_sidecar.py. States beyond the base lifecycle:
 * `unavailable` (no GPU / no Python, see info().reason), `missing` (installable), `installing`, `downloading` (weights).
 */
export class ChatterboxEngine extends LifecycleEngine {
  readonly needsNumberWords = true;
  readonly clones: ClonedVoiceStore;
  #o: ChatterboxOptions;
  #hw: Hardware;
  #reason?: EngineReason;
  #installing?: Promise<void>;
  #proc?: ChildProcess;
  #next = 1;
  #jobs = new Map<number, { resolve: (r: Synthesized) => void; reject: (e: Error) => void }>();

  /** Detects the hardware first, so the initial state is right. */
  static async create(o: ChatterboxOptions): Promise<ChatterboxEngine> {
    return new ChatterboxEngine(o, o.hardware ?? (await detectHardware()));
  }

  constructor(o: ChatterboxOptions, hw: Hardware) {
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
    const a = assess(this.#hw, false);
    this.#reason = a.reason;
    this.setStatus({ state: a.state, detail: a.detail });
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
      python: this.#hw.python,
      uv: this.#hw.uv,
      envDir: join(this.#o.dir, "env"),
      progress: (progress, detail) => this.setStatus({ state: "installing", progress, detail }),
    };
    ctx.progress(0);
    try {
      mkdirSync(this.#o.dir, { recursive: true });
      await (this.#o.installer ?? pipInstall)(ctx);
      writeFileSync(join(this.#o.dir, MARKER), new Date().toISOString());
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      rmSync(ctx.envDir, { recursive: true, force: true });
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
    for (const f of ["env", "hf", MARKER]) rmSync(join(this.#o.dir, f), { recursive: true, force: true });
    const a = assess(this.#hw, false);
    this.#reason = a.reason;
    this.setStatus({ state: a.state, detail: a.detail });
  }

  protected doLoad(): Promise<void> {
    const { command, args } = this.#o.sidecar ?? {
      command: envPython(join(this.#o.dir, "env")),
      args: [this.#o.sidecarScript ?? defaultScript()],
    };
    const proc = (this.#proc = spawn(command, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HF_HOME: join(this.#o.dir, "hf"), PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
    }));
    const tail: string[] = [];
    createInterface({ input: proc.stderr! }).on("line", (l) => {
      tail.push(l);
      if (tail.length > 6) tail.shift();
    });
    return new Promise<void>((resolve, reject) => {
      let loaded = false;
      const fail = (message: string) => {
        const err = new Error(message);
        for (const j of this.#jobs.values()) j.reject(err);
        this.#jobs.clear();
        if (this.#proc === proc) this.#proc = undefined;
        proc.kill();
        if (loaded) this.markUnloaded(message);
        else reject(err);
      };
      createInterface({ input: proc.stdout! }).on("line", (line) => {
        let m: v.InferOutput<typeof Message>;
        try {
          m = v.parse(Message, JSON.parse(line));
        } catch {
          return; // stray library output on stdout
        }
        switch (m.kind) {
          case "progress":
            return this.report({ state: m.phase, progress: m.progress, detail: m.detail });
          case "ready":
            loaded = true;
            return resolve();
          case "fatal":
            return fail(m.message);
          default: {
            const j = this.#jobs.get(m.id);
            if (!j) return;
            this.#jobs.delete(m.id);
            if (m.kind === "error") j.reject(new Error(m.message));
            else {
              const b = Buffer.from(m.pcm, "base64");
              j.resolve({ pcm: new Int16Array(b.buffer, b.byteOffset, b.length >> 1), sampleRate: m.sampleRate });
            }
          }
        }
      });
      proc.on("error", (e) => fail(e.message));
      proc.on("exit", (code) => {
        if (this.#proc === proc) fail(`chatterbox sidecar exited with code ${code}${tail.length ? `: ${tail.join(" | ")}` : ""}`);
      });
    });
  }

  protected async doUnload(): Promise<void> {
    const p = this.#proc;
    this.#proc = undefined;
    for (const j of this.#jobs.values()) j.reject(new Error("engine unloaded"));
    this.#jobs.clear();
    if (!p || p.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      p.once("exit", () => resolve());
      p.stdin?.end();
      p.kill();
    });
  }

  #job(text: string, voice: string, signal?: AbortSignal): Promise<Synthesized> {
    const p = this.#proc;
    if (!p?.stdin?.writable) return Promise.reject(new Error("sidecar is not running"));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#jobs.delete(id)) return;
        p.stdin?.write(JSON.stringify({ op: "abort", id }) + "\n"); // stops generation on the GPU
        reject(signal!.reason);
      };
      const done =
        <T>(f: (x: T) => void) =>
        (x: T) => (signal?.removeEventListener("abort", onAbort), f(x));
      this.#jobs.set(id, { resolve: done(resolve), reject: done(reject) });
      signal?.addEventListener("abort", onAbort, { once: true });
      const reference = this.clones.has(voice) ? this.clones.path(voice) : null;
      p.stdin!.write(JSON.stringify({ op: "synth", id, text, reference }) + "\n");
    });
  }

  protected async doSynthesize(text: string, { voice, signal }: SynthOptions): Promise<Synthesized> {
    if (voice !== CHATTERBOX_VOICE && !this.clones.has(voice)) throw new Error(`unknown voice "${voice}"`);
    const parts: Int16Array[] = [];
    let sampleRate = SAMPLE_RATE;
    for (const piece of splitLong(text, 250)) {
      signal?.throwIfAborted();
      if (parts.length) parts.push(new Int16Array(GAP_SAMPLES));
      const r = await this.#job(piece, voice, signal);
      sampleRate = r.sampleRate;
      parts.push(r.pcm);
    }
    const pcm = new Int16Array(parts.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const a of parts) {
      pcm.set(a, at);
      at += a.length;
    }
    return { pcm, sampleRate };
  }
}
