import { micStatus, type MicStatus } from "@speakkit/dictation";
import type { MicDeviceView, RecorderEvent } from "../../shared/dictation/contract";
import type { RecorderHost } from "./recorder";
import { micEventOf } from "./service-support";

/** What the app knows of the microphone from the microphone window: its state, the listed inputs, and whether the level meter is on. */
export class MicState {
  status: MicStatus = { kind: "none" };
  devices: MicDeviceView[] = [];
  meter = false;
  readonly #canLink: boolean;
  readonly #recorder: () => Pick<RecorderHost, "devices" | "meter"> | undefined;

  /** `canLink`: the operating system has a privacy page to open. */
  constructor(canLink: boolean, recorder: () => Pick<RecorderHost, "devices" | "meter"> | undefined) {
    this.#canLink = canLink;
    this.#recorder = recorder;
  }

  /** Asks the microphone window to list the inputs; the list arrives as an event. */
  list(): Promise<void> | undefined {
    return this.#recorder()?.devices();
  }

  /** Turns the level meter on or off; the microphone is open only while it is on. */
  async setMeter(on: boolean): Promise<void> {
    this.meter = on;
    await this.#recorder()?.meter(on);
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
