import { forgetFailure, onGpuFailure, planDevice, recordFailure, type GpuInfo } from "@speakkit/engine";
import type { EnginesConfig } from "../../shared/speech-models/config";

export interface DevicePolicyDeps {
  config(): EnginesConfig;
  gpu(): GpuInfo | undefined;
  save(): void;
  changed(): void;
  now(): number;
}

/** Where speech runs: the device choice, cards that failed (remembered with their driver), the timing of an integrated card, and the out-of-memory note. */
export class DevicePolicy {
  readonly #d: DevicePolicyDeps;
  /** The model was moved to the CPU because the card was out of memory; the card is not marked as failed. */
  movedByMemory = false;

  constructor(deps: DevicePolicyDeps) {
    this.#d = deps;
  }

  #plan() {
    const gpu = this.#d.gpu();
    const c = this.#d.config();
    return planDevice({ choice: c.device, gpu, failed: c.failedDevices, timed: gpu ? c.timedDevices[`${gpu.name}|${gpu.driver}`] : undefined });
  }

  /** Whether the next load may use the graphics card: decided from the choice, the cards that failed on this driver and an earlier timing. */
  gpuWanted(): boolean {
    return this.#plan().gpu;
  }
  timeIntegrated(): boolean {
    return this.#plan().timeIntegrated;
  }

  /** The integrated card was timed against the CPU: remember the winner for this driver. */
  onTimed(winner: "gpu" | "cpu"): void {
    const gpu = this.#d.gpu();
    if (!gpu) return;
    this.#d.config().timedDevices[`${gpu.name}|${gpu.driver}`] = winner;
    this.#d.save();
  }

  /** Loading on the card failed and the engine went on with the CPU. An out-of-memory failure is not held against the card. */
  onGpuFallback(message: string): void {
    // Without probe data the failure is kept under a generic card, so it is never mislabelled as out of memory.
    const gpu = this.#d.gpu() ?? { name: "Unknown graphics card", driver: "unknown" };
    const c = this.#d.config();
    if (onGpuFailure(message).markFailed) {
      c.failedDevices = recordFailure(c.failedDevices, gpu, { message, at: this.#d.now() });
      this.#d.save();
    } else this.movedByMemory = true;
    this.#d.changed();
  }

  choose(choice: EnginesConfig["device"]): void {
    this.#d.config().device = choice;
    this.movedByMemory = false;
    this.#d.save();
  }

  /** The "try the graphics card again" button: every failure is forgotten. */
  forgetFailures(): void {
    this.#d.config().failedDevices = forgetFailure(this.#d.config().failedDevices);
    this.movedByMemory = false;
    this.#d.save();
  }
}
