import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createLauncher, nodeLauncherDeps, terminalCommand, type Launcher } from "@speakkit/cli";
import type { AppState } from "../../shared/ipc";
import type { ServerApi } from "../server-api";
import type { testEnv } from "../test-env";
import { createAutomationPage } from "./page";

interface Setup {
  /** Folder of the bundled main-process files: cli.js sits next to index.js. */
  here: string;
  dataDir: string;
  state: AppState;
  api: ServerApi;
  /** Test switches: the hook records terminals instead of opening them; the sandbox stands in for the registry PATH, the macOS bin folder and the home folder. */
  test: ReturnType<typeof testEnv>;
}

async function launcherFor(o: Setup, script: string): Promise<Launcher | null> {
  if (process.platform !== "win32" && process.platform !== "darwin") return null;
  return createLauncher(
    nodeLauncherDeps({
      platform: process.platform,
      execPath: process.execPath,
      script,
      home: homedir(),
      dataDir: o.dataDir,
      envPath: process.env["PATH"] ?? "",
      ...(o.test.launcherSandbox && { userPathFile: path.join(o.test.launcherSandbox, "user-path.txt"), macDirs: [path.join(o.test.launcherSandbox, "bin")] }),
    }),
  );
}

/** The Automation settings page with the real launcher, skill folder and terminal opener (the command line tool, the MCP entry and the skill). */
export async function setupAutomationPage(o: Setup) {
  const script = path.join(o.here, "cli.js");
  const terminals: string[] = [];
  const page = createAutomationPage({
    platform: process.platform,
    version: o.state.version,
    execPath: process.execPath,
    script,
    home: o.test.launcherSandbox ? path.join(o.test.launcherSandbox, "home") : homedir(),
    launcher: await launcherFor(o, script),
    skillFs: {
      read: (f) =>
        readFile(f, "utf8").then(
          (t) => t,
          () => null,
        ),
      write: async (f, t) => {
        await mkdir(path.dirname(f), { recursive: true });
        await writeFile(f, t);
      },
    },
    limits: () => (o.state.port ? o.api.limits() : Promise.resolve(null)),
    openTerminal: async (command, dir) => {
      if (o.test.hook) return void terminals.push(`${dir}> ${command}`); // a test must not open a window
      const t = terminalCommand(process.platform === "darwin" ? "darwin" : "win32", command, dir);
      spawn(t.file, t.args, { detached: true, stdio: "ignore", windowsHide: false }).unref();
    },
  });
  return { handlers: page.handlers, terminals: () => [...terminals] };
}
