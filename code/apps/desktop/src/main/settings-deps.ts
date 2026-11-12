import { dialog, type BrowserWindow } from "electron";
import type { AreaName } from "../shared/control/settings-registry";
import { filePickers } from "./dictation/history-api";
import type { DictationService } from "./dictation/service";
import type { HandlerDeps } from "./handlers";
import { testEnv } from "./test-env";

/** What a test answers the settings import dialogs with: the file (null cancels) and whether the settings that reach beyond the app are applied. */
export const scriptedSettingsFile = { open: null as string | null, save: null as string | null, confirm: false };

/** What a change of settings needs from the desktop features. */
export interface SettingsDesktop {
  dictation: DictationService;
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  handlers: Pick<HandlerDeps, "setShortcut">;
}

/** The things a change of settings needs from outside the shell: the desktop features, and the dialogs of an import. */
export function settingsChangeDeps(
  desktop: () => SettingsDesktop | null,
  win: { readonly window: BrowserWindow | null },
): Pick<HandlerDeps, "patchDictation" | "patchArea" | "setShortcut" | "pickSettingsFile" | "confirmImport"> {
  const scripted = __TEST_CODE__ && testEnv().hook;
  const files = filePickers(() => win.window, scripted ? scriptedSettingsFile : undefined);
  return {
    patchDictation: async (patch) => (await desktop()!.dictation.patchSettings(patch)).rejected,
    patchArea: (area, patch) => desktop()!.patchArea(area, patch),
    setShortcut: (id, accelerator) => desktop()!.handlers.setShortcut(id, accelerator),
    pickSettingsFile: () => files.open([{ name: "Settings", extensions: ["json"] }]),
    confirmImport: async (what) => {
      if (scripted) return scriptedSettingsFile.confirm;
      const options = {
        type: "warning" as const,
        title: "Import settings",
        message: "This file also turns on settings that reach beyond Speak Kit.",
        detail: `It would switch on: ${what.join("; ")}.`,
        buttons: ["Leave them out", "Turn them on"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      };
      const w = win.window;
      const r = w ? await dialog.showMessageBox(w, options) : await dialog.showMessageBox(options);
      return r.response === 1;
    },
  };
}
