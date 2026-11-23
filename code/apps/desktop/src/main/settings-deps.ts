import type { AreaName } from "../shared/control/settings-registry";
import type { DictationService } from "./dictation/service";
import type { HandlerDeps } from "./handlers";

/** What a change of settings needs from the desktop features. */
export interface SettingsDesktop {
  dictation: DictationService;
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  handlers: Pick<HandlerDeps, "setShortcut" | "resetShortcuts">;
}

/** The things a change of settings needs from outside the shell: the desktop features. */
export function settingsChangeDeps(desktop: () => SettingsDesktop | null): Pick<HandlerDeps, "patchDictation" | "patchArea" | "setShortcut" | "resetShortcuts"> {
  return {
    patchDictation: async (patch) => (await desktop()!.dictation.patchSettings(patch)).rejected,
    patchArea: (area, patch) => desktop()!.patchArea(area, patch),
    setShortcut: (id, accelerator) => desktop()!.handlers.setShortcut(id, accelerator),
    resetShortcuts: () => desktop()!.handlers.resetShortcuts(),
  };
}
