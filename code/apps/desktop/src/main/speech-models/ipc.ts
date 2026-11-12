import { ipcMain } from "electron";
import { SPEECH_MODEL_METHODS, speechModelChannel, type SpeechModelMethod } from "../../shared/speech-models/channels";
import { SPEECH_MODEL_ARGS, type SpeechModelsBridge } from "../../shared/speech-models/contract";
import { registerValidatedIpc } from "../ipc-register";
import type { SpeechModels } from "./service";

type Handlers = Omit<SpeechModelsBridge, "onView">;

const handlersOf = (s: SpeechModels): Handlers => ({
  view: async () => s.view(),
  download: (id) => s.download(id),
  pauseDownload: async (id) => s.pause(id),
  resumeDownload: async (id) => s.resume(id),
  cancelDownload: (id) => s.cancelDownload(id),
  use: (id) => s.use(id),
  cancelSwitch: () => s.cancelSwitch(),
  remove: (id) => s.remove(id),
  setIdleMinutes: async (m) => s.setIdleMinutes(m as never),
  setDevice: (c) => s.setDevice(c),
  retryGraphicsCard: () => s.retryGraphicsCard(),
  setReleaseOnClose: async (on) => s.setReleaseOnClose(on),
  importFile: (kind, name) => s.importFile(kind, name),
  locateFile: (id) => s.locateFile(id),
  removeImported: (id) => s.removeImported(id),
  scanDisk: () => s.scanDisk(),
  adoptFound: (ids) => s.adoptFound(ids),
  setAutoSwitch: async (c) => s.setAutoSwitch(c),
  dismissNewer: async (id) => s.dismissNewer(id),
  continueWithoutModel: async () => s.continueWithoutModel(),
  measureMemory: () => s.measureMemory(),
  openProxySettings: () => s.openProxySettings(),
  openModelsFolder: () => s.openModelsFolder(),
});

/** The Engines page calls these (only the app window may); arguments are checked before any handler runs. */
export function registerSpeechModelsIpc(s: SpeechModels, isAppWindow: (contents: Electron.WebContents) => boolean): void {
  const handlers = handlersOf(s);
  registerValidatedIpc<SpeechModelMethod>(ipcMain, {
    methods: SPEECH_MODEL_METHODS,
    channel: speechModelChannel,
    args: SPEECH_MODEL_ARGS,
    handler: (m) => handlers[m] as (...a: unknown[]) => unknown,
    trusted: (e) => isAppWindow(e.sender),
  });
}
