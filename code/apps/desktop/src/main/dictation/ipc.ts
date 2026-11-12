import { ipcMain } from "electron";
import * as v from "valibot";
import { DICTATION_METHODS, dictationChannel, HUD_ACTION, type DictationMethod } from "../../shared/dictation/channels";
import { DICTATION_ARGS, HudActionSchema, type DictationBridge } from "../../shared/dictation/contract";
import { registerValidatedIpc } from "../ipc-register";
import type { DictationService } from "./service";

type Handlers = Pick<DictationBridge, DictationMethod>;

const handlersOf = (d: DictationService): Handlers => ({
  status: async () => (await d.ready, await d.refreshKey(), d.status()),
  setEnabled: (on) => d.setEnabled(on),
  patchSettings: (patch) => d.patchSettings(patch),
  downloadModel: (id) => d.download(id),
  cancelDownload: () => d.cancelDownload(),
  historyList: (search) => d.historyList(search),
  historyCopy: (id) => d.historyCopy(id),
  historyRemove: (id) => d.historyRemove(id),
  historyClear: () => d.historyClear(),
  retry: () => d.retry(),
  openSoundSettings: () => d.openSoundSettings(),
  historyStats: () => d.historyStats(),
  historyRecent: (n) => d.historyRecent(n),
  historyUseVersion: (id, vid) => d.historyUseVersion(id, vid),
  historyRetranscribe: (id, model) => d.historyRetranscribe(id, model),
  historyCancelRetranscribe: () => d.historyCancelRetranscribe(),
  historyAudio: (id) => d.historyAudio(id),
  historyDeleteRecording: (id) => d.historyDeleteRecording(id),
  historyExport: () => d.historyExport(),
  historyDismissNotice: () => d.historyDismissNotice(),
  vocabImport: () => d.vocabImport(),
  vocabExport: (format, text) => d.vocabExport(format, text),
});

/** The Settings pages call these (only the app window may); the HUD page may only press its own buttons. Arguments are checked before any handler runs. */
export function registerDictationIpc(d: DictationService, isAppWindow: (contents: Electron.WebContents) => boolean): void {
  const handlers = handlersOf(d);
  registerValidatedIpc<DictationMethod>(ipcMain, {
    methods: DICTATION_METHODS,
    channel: dictationChannel,
    args: DICTATION_ARGS,
    handler: (m) => handlers[m] as (...a: unknown[]) => unknown,
    trusted: (e) => isAppWindow(e.sender),
  });
  ipcMain.on(HUD_ACTION, (e, action) => {
    const parsed = v.safeParse(HudActionSchema, action);
    if (parsed.success && d.ownsHud(e.sender)) d.hudAction(parsed.output);
  });
}
