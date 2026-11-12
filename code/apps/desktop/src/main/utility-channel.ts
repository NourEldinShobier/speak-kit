import type { Channel } from "@speakkit/engine";

/** The part of an Electron utility process the channel uses. */
export interface UtilityChild {
  readonly pid: number | undefined;
  postMessage(m: unknown): void;
  on(ev: "message" | "exit" | "spawn", cb: (x: unknown) => void): unknown;
  once(ev: "exit" | "spawn", cb: () => void): unknown;
  kill(): boolean;
}

/** terminate() resolves after this long even when no exit arrives, so an unload can never hang. */
const TERMINATE_TIMEOUT_MS = 5000;

export function channelOf(child: UtilityChild, timeoutMs = TERMINATE_TIMEOUT_MS): Channel<unknown, unknown> {
  let exited = false;
  child.once("exit", () => void (exited = true));
  return {
    get pid() {
      return child.pid;
    },
    post: (m) => void child.postMessage(m),
    // A utility process has no error event: a failed start shows up as an exit.
    on: (ev: string, cb: (x: never) => void) => {
      if (ev === "message") child.on("message", cb as never);
      if (ev === "exit") child.on("exit", cb as never);
    },
    terminate: () =>
      new Promise<void>((resolve) => {
        if (exited) return resolve();
        const timer = setTimeout(resolve, timeoutMs);
        child.once("exit", () => (clearTimeout(timer), resolve()));
        // kill() before the process has spawned does nothing, and the process then starts anyway: kill it as soon as it exists.
        if (child.pid === undefined) child.once("spawn", () => void child.kill());
        else child.kill();
      }),
  };
}
