import path from "node:path";
import { pathToFileURL } from "node:url";
import { setProcessSpawner } from "@speakkit/engine";
import { utilityChannel } from "./utility-host";

/** The macOS command line runs inside the app binary: the shim starts it as `Speak Kit --speakkit-cli <args>` (the run-as-node fuse is off there). */
export const CLI_FLAG = "--speakkit-cli";

export const isCliLaunch = (argv: readonly string[]): boolean => argv[1] === CLI_FLAG;

/**
 * First thing the main process does. In command line mode it runs the command (no window, no instance lock, no Dock icon), exits, and never returns, so none of
 * the app starts. Otherwise model hosts are started as utility processes.
 */
export async function chooseProcessMode(mainDir: string): Promise<void> {
  if (!isCliLaunch(process.argv)) return setProcessSpawner(utilityChannel);
  const { app } = await import("electron");
  app.dock?.hide();
  await import(pathToFileURL(path.join(mainDir, "../cli/speakkit.js")).href);
  app.exit(Number(process.exitCode ?? 0));
  await new Promise<never>(() => {});
}
