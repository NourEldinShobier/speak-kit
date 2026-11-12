import type { GpuInfo } from "./device";

/** What the machine offers. Fields the operating system could not tell stay undefined and never block anything. */
export interface Hardware {
  platform: "win32" | "darwin" | "linux";
  arch: string;
  /** The CPU has the AVX2 instructions the speech engine needs (x64 only; Apple silicon has its own). */
  avx2?: boolean | undefined;
  cores?: number | undefined;
  memoryGb?: number | undefined;
  gpu?: GpuInfo | undefined;
}

export type FloorVerdict = { ok: true } | { ok: false; missing: string[]; message: string };

/** The engine cannot start at all: say what is missing instead of letting it crash. The floor is not lowered. */
export function checkFloor(hw: Hardware): FloorVerdict {
  const missing: string[] = [];
  if ((hw.arch === "x64" || hw.arch === "ia32") && hw.avx2 === false) missing.push("a processor with AVX2 instructions");
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing, message: `Speech recognition needs ${missing.join(" and ")}, which this computer does not have. Reading aloud and voice chat still work.` };
}

/** Rough size of the machine, used only to decide whether the accurate model is too slow here. */
const MIN_CORES = 4;
const MIN_MEMORY_GB = 8;

/** The accurate model on the CPU alone needs a reasonably strong machine; with a graphics card any machine passes. */
export function accurateModelFits(hw: Hardware): { fits: true } | { fits: false; reason: string } {
  if (hw.gpu && !hw.gpu.integrated) return { fits: true };
  const slowCpu = hw.cores !== undefined && hw.cores < MIN_CORES;
  const lowMemory = hw.memoryGb !== undefined && hw.memoryGb < MIN_MEMORY_GB;
  if (!slowCpu && !lowMemory) return { fits: true };
  return { fits: false, reason: "This computer is too slow for the accurate model. Use the fast one." };
}

/** The label of the device actually in use, from what the engine reports. */
export function deviceInUse(backend: "gpu" | "cpu" | undefined, gpu: GpuInfo | undefined): string {
  if (!backend) return "Not loaded";
  return backend === "gpu" ? (gpu?.name ?? "Graphics card") : "CPU";
}
