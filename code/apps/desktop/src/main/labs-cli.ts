import path from "node:path";
import { labsArgs, runLabsCommand } from "../shared/labs";
import { openConfig } from "./config";

/**
 * `Speak Kit labs list|on|off <lab>`: runs against the settings file in `dataDir` and returns the process exit code, or null when
 * the command line is not a labs command. A running app is told to re-read the file by the second-instance handler.
 */
export async function runLabsCli(argv: readonly string[], dataDir: string, print: (line: string) => void): Promise<number | null> {
  const args = labsArgs(argv);
  if (!args) return null;
  const store = await openConfig(dataDir);
  const r = runLabsCommand(args, store.config.labs);
  print(r.out);
  if (r.next) {
    store.config.labs = r.next;
    store.save();
  }
  return r.code;
}

/** The labs currently on disk, for a running app that was told another process changed them. */
export async function readLabs(dataDir: string) {
  return (await openConfig(path.resolve(dataDir))).config.labs;
}
