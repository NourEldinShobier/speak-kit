import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { childEnv } from "../child-env";
import { isWindows } from "../platform";
import { killTree } from "../process-tree";
import { Watchdog } from "../watchdog";

/** Seconds of installer silence (no output line) after which the install is declared stalled. */
export const INSTALL_IDLE_MS = 120_000;

export interface InstallContext {
  /** Engine directory (`<dataDir>/chatterbox`). */
  dir: string;
  /** Absolute System Python 3.10 to 3.12 command, when one exists. */
  python?: string[];
  /** Absolute uv command, which downloads Python 3.11 itself; preferred over `python`. */
  uv?: string[];
  /** Directory the virtual environment is created in. */
  envDir: string;
  /** Kills a step that prints nothing for this long. Default `INSTALL_IDLE_MS`. */
  idleMs?: number;
  progress(fraction: number, detail?: string): void;
}

/** The virtualenv's Python. */
export const envPython = (envDir: string) => join(envDir, isWindows ? "Scripts/python.exe" : "bin/python");

// chatterbox-tts pins torch 2.6.0, whose Windows and default Linux wheels on PyPI are CPU-only; the CUDA build comes from this index.
const TORCH = ["torch==2.6.0", "torchaudio==2.6.0"];
const TORCH_INDEX = "https://download.pytorch.org/whl/cu124";
// perth (the watermarker chatterbox loads) imports pkg_resources, which setuptools 81 removed.
const PACKAGES = ["chatterbox-tts", "setuptools<81"];

interface RunOptions {
  onLine: (l: string) => void;
  idleMs: number;
}

/** Runs a command to completion, feeding each stdout/stderr line to `onLine`. A step silent for `idleMs` is killed with its children. */
function runLines(cmd: string, args: string[], { onLine, idleMs }: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: childEnv() });
    const tail: string[] = [];
    let stalled = false;
    const dog = new Watchdog(idleMs, () => {
      stalled = true;
      void killTree(p);
    });
    dog.arm();
    for (const s of [p.stdout, p.stderr])
      createInterface({ input: s }).on("line", (l) => {
        dog.beat();
        tail.push(l);
        if (tail.length > 8) tail.shift();
        onLine(l);
      });
    p.on("error", (e) => {
      dog.stop();
      reject(e);
    });
    p.on("close", (code) => {
      dog.stop();
      if (stalled) return reject(new Error(`${cmd} printed nothing for ${idleMs / 1000} s: ${tail.slice(-3).join(" | ")}`));
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with ${code}: ${tail.slice(-3).join(" | ")}`));
    });
  });
}

/** Installs the CUDA torch build and chatterbox-tts into a private virtualenv. Progress is approximate: installers report no total, so each resolved package counts. */
export async function pipInstall({ python, uv, envDir, idleMs = INSTALL_IDLE_MS, progress }: InstallContext): Promise<void> {
  if (!uv && !python) throw new Error("no Python or uv to install with");
  const py = envPython(envDir);
  let seen = 0;
  const count = (l: string) => {
    if (/^(Collecting|Downloading| + )/.test(l)) progress(Math.min(0.95, 0.08 + (++seen / 120) * 0.87), l.trim().slice(0, 80));
  };
  const step = (cmd: string, args: string[], onLine: (l: string) => void = () => {}) => runLines(cmd, args, { onLine, idleMs });
  progress(0.02, "Creating Python environment");
  const [bin, ...pre] = uv ?? python!;
  if (uv) {
    await step(bin!, [...pre, "venv", "--python", "3.11", envDir]);
    progress(0.08, "Installing packages");
    await step(bin!, [...pre, "pip", "install", "--python", py, ...TORCH, "--index-url", TORCH_INDEX], count);
    await step(bin!, [...pre, "pip", "install", "--python", py, ...PACKAGES], count);
    return;
  }
  await step(bin!, [...pre, "-m", "venv", envDir]);
  progress(0.08, "Installing packages");
  const pip = ["-m", "pip", "install", "--progress-bar", "off", "--disable-pip-version-check"];
  await step(py, [...pip, ...TORCH, "--index-url", TORCH_INDEX], count);
  await step(py, [...pip, ...PACKAGES], count);
}
