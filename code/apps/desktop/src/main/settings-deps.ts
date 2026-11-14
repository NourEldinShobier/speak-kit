import { dialog, type BrowserWindow } from "electron";
import type { AreaName } from "../shared/control/settings-registry";
import { filePickers } from "./dictation/history-api";
import type { DictationService } from "./dictation/service";
import type { HandlerDeps } from "./handlers";
import { testEnv } from "./test-env";
import { at } from "../shared/i18n";
import "../shared/i18n/packs/main";

/** What a test answers the settings import dialogs with: the file (null cancels) and whether the settings that reach beyond the app are applied. */
export const scriptedSettingsFile = { open: null as string | null, save: null as string | null, confirm: false };

/** What a change of settings needs from the desktop features. */
export interface SettingsDesktop {
  dictation: DictationService;
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  handlers: Pick<HandlerDeps, "setShortcut" | "resetShortcuts">;
}

/** The things a change of settings needs from outside the shell: the desktop features, and the dialogs of an import. */
export function settingsChangeDeps(
  desktop: () => SettingsDesktop | null,
  win: { readonly window: BrowserWindow | null },
): Pick<HandlerDeps, "patchDictation" | "patchArea" | "setShortcut" | "resetShortcuts" | "pickSettingsFile" | "confirmImport"> {
  const scripted = __TEST_CODE__ && testEnv().hook;
  const files = filePickers(() => win.window, scripted ? scriptedSettingsFile : undefined);
  return {
    patchDictation: async (patch) => (await desktop()!.dictation.patchSettings(patch)).rejected,
    patchArea: (area, patch) => desktop()!.patchArea(area, patch),
    setShortcut: (id, accelerator) => desktop()!.handlers.setShortcut(id, accelerator),
    resetShortcuts: () => desktop()!.handlers.resetShortcuts(),
    pickSettingsFile: () => files.open([{ name: at("filter.settings"), extensions: ["json"] }]),
    confirmImport: async (what) => {
      if (scripted) return scriptedSettingsFile.confirm;
      const options = {
        type: "warning" as const,
        title: at("dialog.importTitle"),
        message: at("dialog.importMessage"),
        detail: at("dialog.importDetail", { what: what.join("; ") }),
        buttons: [at("dialog.leaveOut"), at("dialog.turnOn")],
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
