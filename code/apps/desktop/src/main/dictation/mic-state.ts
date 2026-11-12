import { micStatus, type MicStatus } from "@speakkit/dictation";
import type { MicDeviceView, RecorderEvent } from "../../shared/dictation/contract";
import type { RecorderHost } from "./recorder";
import { micEventOf } from "./service-support";

/** The page renews the meter every few seconds; without a renewal for this long the meter is switched off. */
export const METER_LEASE_MS = 15_000;

export interface MeterEnv {
  enabled(): boolean;
  /** The app window is showing: a hidden window never holds the microphone, whatever its page says. */
  windowShown(): boolean;
  after(ms: number, fn: () => void): () => void;
}

/** What the app knows of the microphone from the microphone window: its state, the listed inputs, and whether the level meter is on. */
export class MicState {
  status: MicStatus = { kind: "none" };
  devices: MicDeviceView[] = [];
  meter = false;
  readonly #canLink: boolean;
  readonly #env: MeterEnv;
  #stopLease: (() => void) | undefined;
  readonly #recorder: () => Pick<RecorderHost, "devices" | "configure"> | undefined;

  /** `canLink`: the operating system has a privacy page to open. */
  constructor(canLink: boolean, recorder: () => Pick<RecorderHost, "devices" | "configure"> | undefined, env: MeterEnv) {
    this.#canLink = canLink;
    this.#recorder = recorder;
    this.#env = env;
  }

  /** Asks the microphone window to list the inputs; the list arrives as an event. */
  list(): Promise<void> | undefined {
    // The list needs the microphone window, and nothing opens a microphone while dictation is off.
    return this.#env.enabled() ? this.#recorder()?.devices() : undefined;
  }

  /**
   * Turns the level meter on or off; the microphone is open only while it is on. "On" is a lease the page renews while it is visible, so a window that
   * was hidden, reloaded or crashed stops using the microphone by itself. Nothing is opened while dictation is off.
   */
  async setMeter(on: boolean): Promise<void> {
    this.#stopLease?.();
    this.#stopLease = undefined;
    if (on && !(this.#env.enabled() && this.#env.windowShown())) return;
    if (on) this.#stopLease = this.#env.after(METER_LEASE_MS, () => void this.setMeter(false));
    if (on === this.meter) return;
    this.meter = on;
    await this.refresh();
  }

  /** Sends the current microphone settings and meter state to the microphone window (which exists only while dictation is on). */
  async refresh(): Promise<void> {
    await this.#recorder()?.configure(this.meter);
  }

  /** Dictation was turned off: the window is gone and so is the meter. */
  reset(): void {
    this.#stopLease?.();
    this.#stopLease = undefined;
    this.meter = false;
  }

  /** Takes in one report. Returns true when something the page shows changed; `silent` says the microphone was found delivering only silence. */
  handle(e: RecorderEvent): { changed: boolean; silent: boolean } {
    if (e.type === "devices") {
      this.devices = e.devices;
      return { changed: true, silent: false };
    }
    const event = micEventOf(e);
    if (!event) return { changed: false, silent: false };
    this.status = micStatus(this.status, event, this.#canLink);
    return { changed: true, silent: e.type === "silent" };
  }
}
