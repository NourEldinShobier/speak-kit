import * as v from "valibot";
import type { GpuInfo, Hardware } from "@speakkit/engine";

/** System boundary: runs a program and returns its output; throws on failure or timeout. */
export type RunProgram = (file: string, args: readonly string[], timeoutMs: number) => Promise<string>;

export interface ProbeEnv {
  platform: NodeJS.Platform;
  arch: string;
  cores: number;
  memoryBytes: number;
  /** Operating system version, used as the "driver" on macOS where graphics drivers ship with the system. */
  osRelease: string;
  run: RunProgram;
}

const DISCRETE = /nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc a\d|arc\(tm\) a|firepro/i;
const NOT_A_CARD = /basic display|remote display|virtual|parsec|indirect|displaylink|mirage/i;

const GB = 1024 ** 3;

interface WinGpu {
  Name?: unknown;
  DriverVersion?: unknown;
}

/** Windows: one PowerShell call reports AVX2 through the processor-feature API and lists the video controllers. */
const WINDOWS_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$sig='[DllImport(\"kernel32.dll\")] public static extern bool IsProcessorFeaturePresent(int f);'",
  "Add-Type -MemberDefinition $sig -Name K -Namespace W",
  "$g=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)",
  "[pscustomobject]@{avx2=[W.K]::IsProcessorFeaturePresent(40);gpus=$g} | ConvertTo-Json -Compress -Depth 3",
].join(";");

/** The card Speak Kit would use: the first discrete one, else the first real adapter. */
export function pickGpu(list: readonly { name: string; driver: string }[]): GpuInfo | undefined {
  const real = list.filter((g) => g.name && !NOT_A_CARD.test(g.name));
  const best = real.find((g) => DISCRETE.test(g.name)) ?? real[0];
  return best && { name: best.name, driver: best.driver, integrated: !DISCRETE.test(best.name) };
}

export function parseWindowsProbe(stdout: string): { avx2: boolean | undefined; gpu: GpuInfo | undefined } {
  let raw: { avx2?: unknown; gpus?: unknown };
  try {
    raw = JSON.parse(stdout.trim());
  } catch {
    return { avx2: undefined, gpu: undefined };
  }
  const gpus = [raw.gpus ?? []].flat() as WinGpu[]; // one card arrives as an object, several as a list
  const list = gpus.map((g) => ({ name: typeof g.Name === "string" ? g.Name.trim() : "", driver: typeof g.DriverVersion === "string" ? g.DriverVersion.trim() : "" }));
  return { avx2: typeof raw.avx2 === "boolean" ? raw.avx2 : undefined, gpu: pickGpu(list) };
}

export function parseMacGraphics(stdout: string, osRelease: string, arch: string): GpuInfo | undefined {
  try {
    const data = JSON.parse(stdout) as { SPDisplaysDataType?: { sppci_model?: unknown; _name?: unknown }[] };
    const first = data.SPDisplaysDataType?.[0];
    const name = String(first?.sppci_model ?? first?._name ?? "").trim();
    if (!name) return undefined;
    // Apple silicon graphics share memory but are fast; only an Intel integrated chip counts as slow.
    return { name, driver: osRelease, integrated: arch !== "arm64" && /intel/i.test(name) };
  } catch {
    return undefined;
  }
}

const platformOf = (p: NodeJS.Platform): Hardware["platform"] => (p === "darwin" || p === "win32" ? p : "linux");

/** What this computer offers. A step that fails leaves its fields unknown, which never blocks anything. */
export async function probeHardware(env: ProbeEnv): Promise<Hardware> {
  const base: Hardware = {
    platform: platformOf(env.platform),
    arch: env.arch,
    cores: env.cores,
    memoryGb: Math.round((env.memoryBytes / GB) * 10) / 10,
  };
  try {
    if (env.platform === "win32") {
      const r = parseWindowsProbe(await env.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], 15_000));
      return { ...base, avx2: r.avx2, gpu: r.gpu };
    }
    if (env.platform === "darwin") {
      const avx2 = env.arch === "x64" ? (await env.run("sysctl", ["-n", "hw.optional.avx2_0"], 5_000)).trim() === "1" : undefined;
      const gpu = parseMacGraphics(await env.run("system_profiler", ["SPDisplaysDataType", "-json"], 15_000).catch(() => ""), env.osRelease, env.arch);
      return { ...base, avx2, gpu };
    }
  } catch {
    // unknown hardware: the floor check lets it through and the engine's own errors speak for themselves
  }
  return base;
}

const HardwareSchema = v.object({
  platform: v.picklist(["win32", "darwin", "linux"]),
  arch: v.string(),
  avx2: v.optional(v.boolean()),
  cores: v.optional(v.number()),
  memoryGb: v.optional(v.number()),
  gpu: v.optional(v.object({ name: v.string(), driver: v.string(), integrated: v.exactOptional(v.boolean()) })),
});

/** The computer a JSON text describes (the end-to-end run's SPEAKKIT_HARDWARE, so a spec sees the same recommendations on every machine), or undefined when the text is not one. */
export function parseHardware(text: string): Hardware | undefined {
  try {
    const r = v.safeParse(HardwareSchema, JSON.parse(text));
    return r.success ? r.output : undefined;
  } catch {
    return undefined;
  }
}
