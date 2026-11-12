import { app } from "electron";
import { utilityChannel } from "../../src/main/utility-host";

/** The app side of the utility process spec: the real spawner, driven from the test through globalThis.__utility. */
app.on("window-all-closed", () => {});

const alive = (pid: number) => {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function build() {
  return {
    /** Starts the child, sends one message, returns its reply and what happens on terminate. */
    async echo(file: string, message: unknown) {
      const ch = utilityChannel(file, {});
      const reply = new Promise((resolve) => ch.on("message", resolve));
      const exits: unknown[] = [];
      ch.on("exit", (c) => exits.push(c));
      ch.post(message);
      const got = await reply;
      const pid = ch.pid as number;
      await ch.terminate();
      await sleep(200);
      return { got, pid, aliveAfter: alive(pid), exits: exits.length };
    },
    /** Terminates straight after the fork, before the process has spawned. */
    async terminateAtOnce(file: string) {
      const ch = utilityChannel(file, {});
      const started = Date.now();
      await ch.terminate();
      const pid = ch.pid as number | undefined;
      await sleep(500);
      return { ms: Date.now() - started, pid, aliveAfter: pid === undefined ? false : alive(pid) };
    },
    /** A child that exits by itself reports it through the exit event. */
    async selfExit(file: string) {
      const ch = utilityChannel(file, {});
      const code = await new Promise((resolve) => ch.on("exit", resolve));
      await ch.terminate();
      return code;
    },
  };
}

export type UtilityApi = ReturnType<typeof build>;
void app.whenReady().then(() => ((globalThis as Record<string, unknown>).__utility = build()));
