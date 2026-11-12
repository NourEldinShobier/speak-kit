import type { BrowserWindow } from "electron";
import { filePickers } from "./dictation/history-api";
import type { DictationService } from "./dictation/service";
import type { HandlerDeps } from "./handlers";
import { testEnv } from "./test-env";

/** What a test answers the settings import dialog with (null cancels). */
export const scriptedSettingsFile = { open: null as string | null, save: null as string | null };

/** The two things a change of settings needs from outside the shell: the dictation feature, and the dialog that asks for a settings file. */
export function settingsChangeDeps(desktop: () => { dictation: DictationService } | null, win: { readonly window: BrowserWindow | null }): Pick<HandlerDeps, "patchDictation" | "pickSettingsFile"> {
  const files = filePickers(() => win.window, __TEST_CODE__ && testEnv().hook ? scriptedSettingsFile : undefined);
  return {
    patchDictation: async (patch) => (await desktop()!.dictation.patchSettings(patch)).rejected,
    pickSettingsFile: () => files.open([{ name: "Settings", extensions: ["json"] }]),
  };
}
