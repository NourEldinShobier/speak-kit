// Runs inside a model host. Plain Node-runnable TS (type stripping): no enums.
interface HostProcess {
  parentPort?: { postMessage(m: unknown): void; on(ev: "message", cb: (e: { data: unknown }) => void): void } | undefined;
  send?: ((m: unknown) => boolean) | undefined;
  on(ev: "message", cb: (m: unknown) => void): unknown;
}

/** How a model host talks to the app: Electron's utility process has a parent port, a forked node process has IPC. Same messages either way. */
export function hostPort(proc: HostProcess = process) {
  const pp = proc.parentPort;
  return {
    send: (m: unknown): void => void (pp ? pp.postMessage(m) : proc.send!(m)),
    onMessage<M>(cb: (m: M) => void): void {
      if (pp) pp.on("message", (e) => cb(e.data as M));
      else proc.on("message", cb as (m: unknown) => void);
    },
  };
}
