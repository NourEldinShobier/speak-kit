import { execFile } from "node:child_process";

export interface Hardware {
  gpu?: { name: string; vramMb: number };
  /** Command (and leading args) of a Python that chatterbox-tts supports. */
  python?: string[];
  /** Command (and leading args) of uv, which can fetch Python itself. */
  uv?: string[];
}
type Run = (cmd: string, args: string[]) => Promise<string | undefined>;

/** chatterbox-tts needs Python 3.10 to 3.12 and an NVIDIA GPU with about 4 GB. */
export const MIN_VRAM_MB = 4096;
const UVS = [["uv"], ["python", "-m", "uv"], ["py", "-m", "uv"]];
const PYTHONS = [["py", "-3.12"], ["py", "-3.11"], ["py", "-3.10"], ["python3.12"], ["python3.11"], ["python3.10"], ["python"], ["python3"]];

/** Stdout of the command, or undefined when it cannot run or exits non-zero. */
const run: Run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });

async function findPython(exec: Run = run): Promise<string[] | undefined> {
  const found = await Promise.all(
    PYTHONS.map(async ([cmd, ...pre]) => {
      const m = /Python 3\.(\d+)/.exec((await exec(cmd!, [...pre, "--version"])) ?? "");
      return m && Number(m[1]) >= 10 && Number(m[1]) <= 12 ? [cmd!, ...pre] : undefined;
    }),
  );
  return found.find((c) => c !== undefined);
}

async function findUv(exec: Run): Promise<string[] | undefined> {
  const found = await Promise.all(UVS.map(async ([cmd, ...pre]) => (/^uv \d/.test((await exec(cmd!, [...pre, "--version"])) ?? "") ? [cmd!, ...pre] : undefined)));
  return found.find((c) => c !== undefined);
}

export async function detectHardware(exec: Run = run): Promise<Hardware> {
  const [smi, python, uv] = await Promise.all([exec("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]), findPython(exec), findUv(exec)]);
  const hw: Hardware = {};
  const m = /^(.+?),\s*(\d+)\s*$/m.exec(smi ?? "");
  if (m) hw.gpu = { name: m[1]!.trim(), vramMb: Number(m[2]) };
  if (python) hw.python = python;
  if (uv) hw.uv = uv;
  return hw;
}
