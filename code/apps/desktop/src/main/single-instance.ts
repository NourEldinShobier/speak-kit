import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** A stop request that has not ended the app after this long ends it anyway: a stuck instance must not block the next start. */
export const STOP_GUARD_MS = 20_000;
/** How long a newer install waits for the older one it asked to leave. */
export const REPLACE_WAIT_MS = 25_000;

const parts = (v: string) =>
  v
    .split("-")[0]!
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);

/** Is version `a` higher than `b`? Compares the numeric parts; a pre-release tag is lower than the plain release. */
export function isNewer(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return !a.includes("-") && b.includes("-");
}

export type SecondLaunch = "quit" | "replace" | "open";

/** What the running instance does when another copy starts: leave on --quit or for a newer install, otherwise show itself or follow the link. */
export function classifySecondLaunch(argv: readonly string[], ownVersion: string, incoming: unknown): SecondLaunch {
  if (argv.includes("--quit")) return "quit";
  const v = incoming && typeof incoming === "object" ? (incoming as { version?: unknown }).version : undefined;
  return typeof v === "string" && isNewer(v, ownVersion) ? "replace" : "open";
}

interface Acquire {
  /** Takes the lock; false when another instance holds it (the holder is told about this launch). */
  tryLock(): boolean;
  /** The version the instance that holds the lock reports, or null when unknown. */
  runningVersion(): Promise<string | null>;
  ownVersion: string;
  wait(ms: number): Promise<void>;
  stepMs?: number;
  replaceMs?: number;
}

/** True when this process may run: it got the lock, or it is newer than the instance that held it and that one left within the wait. */
export async function acquireInstance(d: Acquire): Promise<boolean> {
  if (d.tryLock()) return true;
  const running = await d.runningVersion();
  if (running === null || !isNewer(d.ownVersion, running)) return false;
  const step = d.stepMs ?? 1000;
  for (let waited = 0; waited < (d.replaceMs ?? REPLACE_WAIT_MS); waited += step) {
    await d.wait(step);
    if (d.tryLock()) return true;
  }
  return false;
}

/** Starts the countdown after a stop request; `exit` runs if the app is still there when it ends. Returns a cancel. */
export function stopGuard(exit: () => void, ms = STOP_GUARD_MS): () => void {
  const t = setTimeout(exit, ms);
  t.unref?.();
  return () => clearTimeout(t);
}

const RUNNING_FILE = "instance.json";

export async function writeRunningVersion(dir: string, version: string): Promise<void> {
  try {
    await writeFile(path.join(dir, RUNNING_FILE), JSON.stringify({ version, pid: process.pid }));
  } catch {
    /* only a newer install reads it; running without it is fine */
  }
}

export async function clearRunningVersion(dir: string): Promise<void> {
  try {
    await rm(path.join(dir, RUNNING_FILE), { force: true });
  } catch {
    /* a stale file is replaced at the next start */
  }
}
export async function readRunningVersion(dir: string): Promise<string | null> {
  try {
    const v = (JSON.parse(await readFile(path.join(dir, RUNNING_FILE), "utf8")) as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
