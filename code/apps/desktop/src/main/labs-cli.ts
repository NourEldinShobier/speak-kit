import path from "node:path";
import { labsArgs } from "../shared/labs";
import { readLabsFile, runLabsFile } from "../cli/labs-file";

/**
 * `Speak Kit labs list|on|off <lab>` run on the app's own executable: returns the process exit code, or null when the command line
 * is not a labs command. A running app is told to re-read the file by the second-instance handler.
 */
export async function runLabsCli(argv: readonly string[], dataDir: string, print: (line: string) => void): Promise<number | null> {
  const args = labsArgs(argv);
  return args && runLabsFile(args, dataDir, print);
}

/** The labs currently on disk, for a running app that was told another process changed them; null when the file cannot be read. */
export const readLabs = (dataDir: string) => readLabsFile(path.resolve(dataDir));
