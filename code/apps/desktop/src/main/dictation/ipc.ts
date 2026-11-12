import { openMicrophoneSettings } from "./mic-settings";
import { ipcMain } from "electron";
import * as v from "valibot";
import { DICTATION_METHODS, dictationChannel, HUD_ACTION, type DictationMethod } from "../../shared/dictation/channels";
import { DICTATION_ARGS, HudActionSchema, type DictationBridge } from "../../shared/dictation/contract";
import { registerValidatedIpc } from "../ipc-register";
import type { DictationService } from "./service";

type Handlers = Pick<DictationBridge, DictationMethod>;

const handlersOf = (d: DictationService): Handlers => ({
  status: async () => (await d.ready, await d.records.refreshKey(), d.status()),
  setEnabled: (on) => d.setEnabled(on),
  patchSettings: (patch) => d.patchSettings(patch),
  downloadModel: (id) => d.download(id),
  cancelDownload: () => d.cancelDownload(),
  historyList: (search) => d.records.list(search),
  historyCopy: (id) => d.history.copy(id),
  historyRemove: (id) => d.records.remove([id]),
  historyClear: () => d.records.clear(),
  historyRemoveMany: (ids) => d.records.remove(ids),
  micDevices: async () => (await d.ready, await d.mic.list(), d.status()),
  micMeter: async (on) => (await d.ready, d.mic.setMeter(on)),
  retry: () => d.actions.retry(),
  setPaused: async (on) => (await d.ready, d.controls.setPaused(on), d.status()),
  pasteLast: async () => (await d.ready, d.controls.pasteLast()),
  undoCancel: async () => (await d.ready, d.controls.undoCancel()),
  openSoundSettings: () => d.actions.openSoundSettings(),
  openMicrophoneSettings: () => openMicrophoneSettings(),
  historyStats: () => d.records.stats(),
  historyRecent: (n) => d.records.recent(n),
  historyUseVersion: (id, vid) => d.records.useVersion(id, vid),
  historyRetranscribe: (id, model, language) => d.records.retranscribe(id, model, language),
  historyCancelRetranscribe: () => d.records.cancelRetranscribe(),
  historyAudio: (id) => d.records.audio(id),
  historyDeleteRecording: (id) => d.records.deleteRecording(id),
  historyExport: () => d.records.export(),
  historyDismissNotice: () => d.records.dismissNotice(),
  vocabImport: () => d.records.vocabImport(),
  vocabExport: (format, text) => d.records.vocabExport(format, text),
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
    if (parsed.success && d.ownsHud(e.sender)) d.actions.hudAction(parsed.output);
  });
}
