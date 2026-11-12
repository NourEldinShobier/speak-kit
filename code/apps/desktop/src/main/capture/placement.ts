import type { Rectangle } from "electron";
import type { CapturePlatform } from "./platform/types";
import type { SessionState, Target } from "./session";
import { displayOfTarget, lostDisplay, titleOfTarget } from "./target-display";

export interface PlacementDeps {
  platform: CapturePlatform;
  state(): SessionState;
  /** The capsule and the ink layer should move to the recorded display. */
  relocate(): void;
}

/** What is being recorded, as the capsule shows it: the name for the chip and the display the capsule and the ink layer sit on. */
export class Placement {
  readonly #d: PlacementDeps;
  title = "Screen";
  bounds: Rectangle | undefined;

  constructor(deps: PlacementDeps) {
    this.#d = deps;
  }

  /** The session changed: a new target gives a new name and place. */
  sessionChanged() {
    const t = this.#d.state().target;
    if (!t) return;
    this.title = titleOfTarget(t, this.#d.platform.displays());
    this.bounds = undefined;
    void this.#place(t);
  }

  /** For a window the capsule goes to the display it is on. */
  async #place(t: Target) {
    const windows = t.kind === "window" ? await this.#d.platform.windows().catch(() => []) : [];
    if (this.#d.state().target !== t) return;
    this.bounds = displayOfTarget(t, this.#d.platform.displays(), windows)?.bounds;
    this.#d.relocate();
  }

  /** A screen that is being recorded was unplugged. */
  recordedDisplayLost(): boolean {
    const { phase, target } = this.#d.state();
    return phase === "recording" && !!target && lostDisplay(target, this.#d.platform.displays());
  }
}
