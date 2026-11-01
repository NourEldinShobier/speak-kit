import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import * as v from "valibot";
import { childEnv } from "../child-env";
import { killTree } from "../process-tree";
import type { Synthesized } from "../types";
import { Watchdog } from "../watchdog";

/** Silence (no message or stderr line) after which a loading sidecar is declared stalled. */
const LOAD_IDLE_MS = 120_000;
/** Silence after which a sidecar with a synthesis request outstanding is declared stalled. */
const REQUEST_IDLE_MS = 60_000;

const Message = v.variant("kind", [
  v.object({ kind: v.literal("progress"), phase: v.picklist(["downloading", "loading"]), progress: v.optional(v.number()), detail: v.optional(v.string()) }),
  v.object({ kind: v.literal("ready") }),
  v.object({ kind: v.literal("fatal"), message: v.string() }),
  v.object({ kind: v.literal("audio"), id: v.number(), sampleRate: v.number(), pcm: v.string() }),
  v.object({ kind: v.literal("error"), id: v.number(), message: v.string() }),
]);
type Message = v.InferOutput<typeof Message>;

interface SidecarOptions {
  command: string;
  args: string[];
  /** Hugging Face cache directory handed to the sidecar. */
  hfHome: string;
  loadIdleMs?: number;
  requestIdleMs?: number;
  onProgress(s: { state: "downloading" | "loading"; progress?: number; detail?: string }): void;
  /** The sidecar died or stalled after it had reported ready. */
  onCrash(message: string): void;
}

interface Job {
  resolve(r: Synthesized): void;
  reject(e: Error): void;
}

/**
 * The Chatterbox Python process and its JSON-lines protocol (see sidecar/chatterbox_sidecar.py).
 * Does: spawns it, relays load progress, runs synthesis requests, enforces heartbeat deadlines, kills its process tree.
 * Does not: decide engine states or restarts; the engine reacts to `onCrash`.
 */
export class Sidecar {
  #o: SidecarOptions;
  #proc: ChildProcess;
  #jobs = new Map<number, Job>();
  #next = 1;
  #tail: string[] = [];
  #loaded = false;
  #dead = false;
  #dog: Watchdog;
  #ready: Promise<void>;
  #resolveReady!: () => void;
  #rejectReady!: (e: Error) => void;

  /** Resolves when the sidecar reports ready; rejects when it fails or stalls first. */
  static async start(o: SidecarOptions): Promise<Sidecar> {
    const s = new Sidecar(o);
    await s.#ready;
    return s;
  }

  private constructor(o: SidecarOptions) {
    this.#o = o;
    this.#ready = new Promise((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    this.#dog = this.#newDog(o.loadIdleMs ?? LOAD_IDLE_MS);
    const proc = (this.#proc = spawn(o.command, o.args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv({ HF_HOME: o.hfHome, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" }),
    }));
    this.#dog.arm();
    createInterface({ input: proc.stderr! }).on("line", (l) => {
      this.#dog.beat();
      this.#tail.push(l);
      if (this.#tail.length > 6) this.#tail.shift();
    });
    createInterface({ input: proc.stdout! }).on("line", (line) => this.#onLine(line));
    proc.stdin!.on("error", () => {}); // a dead sidecar surfaces through "exit"; a write to it must not crash the host
    proc.on("error", (e) => this.#fail(e.message));
    proc.on("exit", (code) => this.#fail(`chatterbox sidecar exited with code ${code}${this.#tail.length ? `: ${this.#tail.join(" | ")}` : ""}`));
  }

  #newDog(ms: number): Watchdog {
    return new Watchdog(ms, () => this.#fail(`chatterbox sidecar sent nothing for ${ms / 1000} s`));
  }

  #onLine(line: string): void {
    let m: Message;
    try {
      m = v.parse(Message, JSON.parse(line));
    } catch {
      return; // stray library output on stdout
    }
    this.#dog.beat();
    switch (m.kind) {
      case "progress":
        return this.#o.onProgress({ state: m.phase, ...(m.progress !== undefined && { progress: m.progress }), ...(m.detail !== undefined && { detail: m.detail }) });
      case "ready":
        this.#loaded = true;
        this.#dog.stop();
        this.#dog = this.#newDog(this.#o.requestIdleMs ?? REQUEST_IDLE_MS);
        return this.#resolveReady();
      case "fatal":
        return this.#fail(m.message);
      default:
        return this.#answer(m);
    }
  }

  #answer(m: Extract<Message, { kind: "audio" | "error" }>): void {
    const j = this.#jobs.get(m.id);
    if (!j) return;
    this.#jobs.delete(m.id);
    if (this.#jobs.size === 0) this.#dog.stop();
    if (m.kind === "error") return j.reject(new Error(m.message));
    const b = Buffer.from(m.pcm, "base64");
    j.resolve({ pcm: new Int16Array(b.buffer, b.byteOffset, b.length >> 1), sampleRate: m.sampleRate });
  }

  #rejectJobs(err: Error): void {
    for (const j of this.#jobs.values()) j.reject(err);
    this.#jobs.clear();
  }

  #fail(message: string): void {
    if (this.#dead) return;
    this.#dead = true;
    this.#dog.stop();
    this.#rejectJobs(new Error(message));
    void killTree(this.#proc);
    if (this.#loaded) this.#o.onCrash(message);
    else this.#rejectReady(new Error(message));
  }

  /** One synthesis request. `reference` is a clip path to clone from, or null for the stock voice. An abort tells the sidecar to stop generating. */
  synth(text: string, reference: string | null, signal?: AbortSignal): Promise<Synthesized> {
    const stdin = this.#proc.stdin;
    if (this.#dead || !stdin?.writable) return Promise.reject(new Error("sidecar is not running"));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#jobs.delete(id)) return;
        stdin.write(JSON.stringify({ op: "abort", id }) + "\n");
        if (this.#jobs.size === 0) this.#dog.stop();
        reject(signal!.reason);
      };
      const done =
        <T>(f: (x: T) => void) =>
        (x: T) => (signal?.removeEventListener("abort", onAbort), f(x));
      this.#jobs.set(id, { resolve: done(resolve), reject: done(reject) });
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#dog.arm();
      stdin.write(JSON.stringify({ op: "synth", id, text, reference }) + "\n");
    });
  }

  /** Ends the process (and its children) and waits for it to exit. Pending requests reject with "engine unloaded". */
  async stop(): Promise<void> {
    this.#dead = true;
    this.#dog.stop();
    this.#rejectJobs(new Error("engine unloaded"));
    this.#rejectReady(new Error("sidecar stopped"));
    const p = this.#proc;
    if (p.exitCode !== null || p.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      p.once("exit", () => resolve());
      p.stdin?.end();
      void killTree(p);
    });
  }
}
