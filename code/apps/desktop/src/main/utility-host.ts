import { utilityProcess } from "electron";
import type { Channel } from "@speakkit/engine";

/**
 * Starts a model host as an Electron utility process: a Node environment that loads the native addons like any child process, without needing the
 * app binary to run as plain Node (the run-as-node fuse stays off on macOS). Messages are structured-cloned both ways.
 */
export function utilityChannel(file: string, env: Record<string, string>): Channel<unknown, unknown> {
  const child = utilityProcess.fork(file, [], { env, serviceName: "Speak Kit model host", stdio: "inherit" });
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
        child.once("exit", () => resolve());
        child.kill();
      }),
  };
}
