import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { childEnv } from "./child-env";

/** What an engine needs from a worker thread or a child process: typed messages both ways, and a way to stop it. */
export interface Channel<To, From> {
  post(m: To): void;
  on(ev: "message", cb: (m: From) => void): void;
  on(ev: "error", cb: (e: Error) => void): void;
  on(ev: "exit", cb: (code: number | null) => void): void;
  terminate(): Promise<void>;
  pid?: number | undefined;
}

export function threadChannel<To, From>(url: URL | string, workerData: unknown): Channel<To, From> {
  const w = new Worker(url, { workerData });
  return {
    post: (m) => w.postMessage(m),
    on: (ev: string, cb: (x: never) => void) => void w.on(ev, cb as never),
    terminate: async () => void (await w.terminate()),
  };
}

/** Starts a model host from a script file with this environment. */
export type ProcessSpawner = (file: string, env: Record<string, string>) => Channel<unknown, unknown>;

function forkHost(file: string, env: Record<string, string>): Channel<unknown, unknown> {
  const c: ChildProcess = fork(file, [], { serialization: "advanced", execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"], env });
  return {
    pid: c.pid,
    post: (m) => void c.send(m as never),
    on: (ev: string, cb: (x: never) => void) => void c.on(ev, cb as never),
    terminate: () =>
      new Promise((resolve) => {
        if (c.exitCode !== null || c.signalCode !== null) return resolve();
        c.once("exit", () => resolve());
        c.kill();
      }),
  };
}

let spawner: ProcessSpawner = forkHost;
/** The desktop app starts model hosts as Electron utility processes, so the packaged app can ship with the run-as-node fuse off. Default: node's fork. */
export const setProcessSpawner = (s: ProcessSpawner = forkHost): void => void (spawner = s);

/** The init object travels in SPEAKKIT_WORKER_INIT; the child is a plain node process (see childEnv). `env` adds variables the child must have before it starts. */
export function processChannel<To, From>(url: URL | string, init: unknown, env: Record<string, string> = {}): Channel<To, From> {
  const file = typeof url === "string" && !url.startsWith("file:") ? url : fileURLToPath(url);
  return spawner(file, childEnv({ ...env, SPEAKKIT_WORKER_INIT: JSON.stringify(init) })) as Channel<To, From>;
}
