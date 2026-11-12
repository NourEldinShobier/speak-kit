// Entry of the `speakkit` command. The app's own executable runs this file as plain Node (ELECTRON_RUN_AS_NODE, see the launcher in
// packages/cli), which is what lets it print in a terminal: the GUI executable itself prints nothing there.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLauncher, dataDirFor, nodeIo, nodeLauncherDeps, runCli, type Launcher } from "@speakkit/cli";
import { runLabsFile } from "./labs-file";

const here = path.dirname(fileURLToPath(import.meta.url));
const version = (JSON.parse(await readFile(path.join(here, "../../package.json"), "utf8")) as { version: string }).version;
const dataDir = dataDirFor({ platform: process.platform, env: process.env, home: homedir() });

// A running app notices the change itself: it watches the settings file.
const labs = (args: string[]) =>
  runLabsFile(
    args,
    dataDir,
    (line) =>
      void process.stdout.write(`${line}
`),
  );

async function launcher(): Promise<Launcher | undefined> {
  if (process.platform !== "win32" && process.platform !== "darwin") return undefined;
  return createLauncher(
    nodeLauncherDeps({ platform: process.platform, execPath: process.execPath, script: path.resolve(fileURLToPath(import.meta.url)), home: homedir(), dataDir, envPath: process.env["PATH"] ?? "" }),
  );
}

const argv = process.argv.slice(2);
// exitCode, not exit(): output still being written to a pipe is not cut off.
process.exitCode = argv[0] === "labs" ? await labs(argv.slice(1)) : await runCli(argv, nodeIo(version, await launcher()));
