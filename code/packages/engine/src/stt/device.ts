export type DeviceChoice = "auto" | "gpu" | "cpu";
export const DEVICE_CHOICES: readonly DeviceChoice[] = ["auto", "gpu", "cpu"];

/** The graphics card as the operating system describes it. */
export interface GpuInfo {
  name: string;
  /** Driver version string; a failure is remembered per driver, so a driver update gives the card another try. */
  driver: string;
  /** Shares memory with the CPU (about 10 times slower than a discrete card, measured). */
  integrated?: boolean;
}

/** A graphics card that failed to run speech, with the driver it failed on. */
export interface FailedDevice {
  name: string;
  driver: string;
  reason: string;
  at: number;
}

export type DeviceReason = "chose-cpu" | "chose-gpu" | "no-gpu" | "failed-before" | "auto";

export interface DevicePlan {
  /** Whether to load the graphics runtime at all. A CPU plan loads none. */
  gpu: boolean;
  reason: DeviceReason;
  /** Auto with only an integrated card: the first load times it against the CPU and keeps the faster. */
  timeIntegrated: boolean;
}

export const sameDevice = (a: { name: string; driver: string }, b: { name: string; driver: string }) => a.name === b.name && a.driver === b.driver;

export interface PlanInput {
  choice: DeviceChoice;
  gpu: GpuInfo | undefined;
  failed: readonly FailedDevice[];
  /** The outcome of an earlier timing of an integrated card for this driver. */
  timed?: "gpu" | "cpu" | undefined;
}

/** Decides where speech runs. An explicit choice is always honoured (even for a card that failed before: choosing it again is the retry). */
export function planDevice({ choice, gpu, failed, timed }: PlanInput): DevicePlan {
  if (choice === "cpu") return { gpu: false, reason: "chose-cpu", timeIntegrated: false };
  if (choice === "gpu") return { gpu: true, reason: "chose-gpu", timeIntegrated: false };
  if (!gpu) return { gpu: false, reason: "no-gpu", timeIntegrated: false };
  if (failed.some((f) => sameDevice(f, gpu))) return { gpu: false, reason: "failed-before", timeIntegrated: false };
  if (gpu.integrated) return timed ? { gpu: timed === "gpu", reason: "auto", timeIntegrated: false } : { gpu: true, reason: "auto", timeIntegrated: true };
  return { gpu: true, reason: "auto", timeIntegrated: false };
}

const OOM = /out of (device )?memory|OUT_OF_DEVICE_MEMORY|OUT_OF_HOST_MEMORY|\bOOM\b|failed to allocate|insufficient (device )?memory|cannot allocate|alloc(ation)? (of|failed)|bad_alloc/i;
export const isOutOfMemory = (message: string): boolean => OOM.test(message);

/** What to do when loading on the graphics card failed. An out-of-memory failure is about the amount of memory free right now, not about the card or its driver, so the card is not remembered as failed. */
export function onGpuFailure(message: string): { markFailed: boolean; runOnCpu: true } {
  return { markFailed: !isOutOfMemory(message), runOnCpu: true };
}

/** The list after a failure: replaces an earlier entry for the same card and driver, ignores out-of-memory failures. */
export function recordFailure(list: readonly FailedDevice[], gpu: GpuInfo, failure: { message: string; at: number }): FailedDevice[] {
  if (isOutOfMemory(failure.message)) return [...list];
  return [...list.filter((f) => !sameDevice(f, gpu)), { name: gpu.name, driver: gpu.driver, reason: failure.message.slice(0, 300), at: failure.at }];
}

/** Forgets the failure of this card (the "try the graphics card again" button), or every failure when no card is given. */
export const forgetFailure = (list: readonly FailedDevice[], gpu?: Pick<GpuInfo, "name" | "driver">): FailedDevice[] => (gpu ? list.filter((f) => !sameDevice(f, gpu)) : []);

/** The faster of two measured times; the card must win by a clear margin to be used, because it also costs power and memory. */
export const pickFaster = (gpuMs: number, cpuMs: number, margin = 0.8): "gpu" | "cpu" => (gpuMs <= cpuMs * margin ? "gpu" : "cpu");

/** Slowdown to warn about when speech runs on the CPU although a card exists. */
export const CPU_SLOWDOWN_WARNING = "On the CPU speech can be many times slower than on the graphics card.";
