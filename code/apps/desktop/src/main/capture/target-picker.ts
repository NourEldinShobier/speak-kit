import { ipcMain } from "electron";
import type { CaptureConfig } from "../../shared/capture/settings";
import { displayAt, remember } from "./picker";
import { createPickerFlow, type PickerFlow } from "./picker/flow";
import type { CapturePlatform } from "./platform/types";
import type { Target } from "./session";
import { capturePage, openOverlayWindow } from "./windows";

export interface TargetPickerDeps {
  platform: CapturePlatform;
  distDir: string;
  settings(): CaptureConfig;
  saveConfig(): void;
}

/** The picker over every display. A choice is remembered per display; Esc and a closed picker are a clean exit. */
export class TargetPicker {
  readonly #d: TargetPickerDeps;
  #flow: PickerFlow | undefined;

  constructor(deps: TargetPickerDeps) {
    this.#d = deps;
  }

  async pick(signal: AbortSignal, switching: boolean): Promise<Target | null> {
    const { platform: p, distDir } = this.#d;
    this.#flow ??= createPickerFlow({
      ipcMain,
      displays: () => p.displays(),
      windows: () => p.windows(),
      open: (display) => openOverlayWindow(capturePage(distDir, "capture-overlay"), display.bounds),
      lastTargets: () => this.#d.settings().lastTargets,
      windowPicker: p.windowPicker,
    });
    const target = await this.#flow.pick(signal, switching);
    if (target) this.#remember(target);
    return target;
  }

  #remember(t: Target) {
    const p = this.#d.platform;
    const id = t.kind === "window" ? displayAt(p.cursor(), p.displays())?.id : t.displayId;
    if (!id) return;
    const s = this.#d.settings();
    s.lastTargets = remember(s.lastTargets, id, t.kind);
    this.#d.saveConfig();
  }

  dispose() {
    this.#flow?.dispose();
  }
}
