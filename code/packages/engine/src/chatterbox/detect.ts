import { execFile } from "node:child_process";
import { join } from "node:path";
import { isWindows } from "../platform";

export interface Hardware {
  gpu?: { name: string; vramMb: number };
  /** Absolute command (and leading args) of a Python that chatterbox-tts supports. */
  python?: string[];
  /** Absolute command (and leading args) of uv, which can fetch Python itself. */
  uv?: string[];
}
type Run = (cmd: string, args: string[]) => Promise<string | undefined>;
/** Absolute path of a command on PATH, or undefined when it is not installed. */
type Resolve = (cmd: string) => Promise<string | undefined>;

/** chatterbox-tts needs Python 3.10 to 3.12 and an NVIDIA GPU with about 4 GB. */
export const MIN_VRAM_MB = 4096;
const UVS = [["uv"], ["python", "-m", "uv"], ["py", "-m", "uv"]];
const PYTHONS = [["py", "-3.12"], ["py", "-3.11"], ["py", "-3.10"], ["python3.12"], ["python3.11"], ["python3.10"], ["python"], ["python3"]];
const LINE_BREAK = /\r?\n/;
const PYTHON_VERSION = /Python 3\.(\d+)/;
const UV_VERSION = /^uv \d/;

/** Stdout of the command, or undefined when it cannot run or exits non-zero. */
const run: Run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });

/** First hit of `where` (Windows) or `which`; the probes and the sidecar then run that path, not a bare name. */
const resolveOnPath: Resolve = async (cmd) => {
  const finder = isWindows ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe") : "which";
  return (await run(finder, [cmd]))
    ?.split(LINE_BREAK)
    .find((l) => l.trim())
    ?.trim();
};

/** Resolves each distinct command name once. */
function cachedResolve(resolve: Resolve): Resolve {
  const seen = new Map<string, Promise<string | undefined>>();
  return (cmd) => {
    if (!seen.has(cmd)) seen.set(cmd, resolve(cmd));
    return seen.get(cmd)!;
  };
}

/** Returns the first candidate (command plus leading args), with its command made absolute, for which `works(absolute command, leading args)` holds. */
async function firstWorking(candidates: string[][], resolve: Resolve, works: (abs: string, pre: string[]) => Promise<boolean>): Promise<string[] | undefined> {
  const found = await Promise.all(
    candidates.map(async ([cmd, ...pre]) => {
      const abs = await resolve(cmd!);
      return abs && (await works(abs, pre)) ? [abs, ...pre] : undefined;
    }),
  );
  return found.find((c) => c !== undefined);
}

function supportedPython(out: string): boolean {
  const m = PYTHON_VERSION.exec(out);
  return !!m && Number(m[1]) >= 10 && Number(m[1]) <= 12;
}

/**
 * Probes the machine for an NVIDIA GPU, a supported Python and uv. Commands are resolved to absolute paths once.
 * @param exec runs a command; injectable for tests. With a custom `exec` and no `resolve`, names are used as given.
 * @param resolve finds a command's absolute path.
 */
export async function detectHardware(exec: Run = run, resolve: Resolve = exec === run ? resolveOnPath : async (c) => c): Promise<Hardware> {
  const res = cachedResolve(resolve);
  const smiPath = await res("nvidia-smi");
  const [smi, python, uv] = await Promise.all([
    smiPath ? exec(smiPath, ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]) : undefined,
    firstWorking(PYTHONS, res, async (abs, pre) => supportedPython((await exec(abs, [...pre, "--version"])) ?? "")),
    firstWorking(UVS, res, async (abs, pre) => UV_VERSION.test((await exec(abs, [...pre, "--version"])) ?? "")),
  ]);
  const hw: Hardware = {};
  const m = /^(.+?),\s*(\d+)\s*$/m.exec(smi ?? "");
  if (m) hw.gpu = { name: m[1]!.trim(), vramMb: Number(m[2]) };
  if (python) hw.python = python;
  if (uv) hw.uv = uv;
  return hw;
}
