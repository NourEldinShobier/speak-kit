import { app } from "electron";
import path from "node:path";
import { acquireInstance, classifySecondLaunch, clearRunningVersion, exitAfterCleanup, readRunningVersion, stopGuard, writeRunningVersion } from "./single-instance";

/**
 * Takes the one-instance lock for this user. A newer install waits for an older running copy it asks to leave; `--quit` only asks the
 * running copy to exit. Once running, `announce` records this version for a newer install to read, and `onSecondLaunch` answers another start.
 */
export async function claimInstance(dataDir: string, argv: readonly string[], shutdown: { saving(): Promise<unknown> | undefined; cleanup(): Promise<unknown> | unknown }) {
  const version = app.getVersion();
  const lock = () => app.requestSingleInstanceLock({ version });
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const mayRun = argv.includes("--quit") ? (lock(), false) : await acquireInstance({ tryLock: lock, runningVersion: () => readRunningVersion(dataDir), ownVersion: version, wait });
  return {
    mayRun,
    announce(): void {
      void writeRunningVersion(dataDir, version);
      app.on("will-quit", () => void clearRunningVersion(dataDir));
    },
    /** True when this copy was asked to leave (a stuck one shuts down and exits by itself after the stop guard); false when the launch only wants the window. */
    onSecondLaunch(second: readonly string[], data: unknown, leave: () => void): boolean {
      if (classifySecondLaunch(second, version, data) === "open") return false;
      leave();
      stopGuard(() => void exitAfterCleanup({ ...shutdown, exit: () => app.exit(0) }));
      return true;
    },
  };
}

const PROTOCOL = "speakkit";

/** Makes speakkit:// links open this app. */
export function registerProtocol(): void {
  // Tests run with an isolated userData; do not touch the user's registry then.
  if (process.env.SPEAKKIT_USER_DATA && !process.env.SPEAKKIT_REGISTER_PROTOCOL) return;
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}
