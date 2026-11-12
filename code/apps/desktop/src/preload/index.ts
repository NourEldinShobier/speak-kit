import { contextBridge, ipcRenderer, webUtils } from "electron";
import { captureBridge } from "../shared/capture/preload-api";
import { dictationBridge } from "../shared/dictation/preload-api";
import { permissionsBridge } from "../shared/permissions/preload-api";
import { meetingsBridge } from "../shared/meetings/preload-api";
import { libraryBridge } from "../shared/library/preload-api";
import { transcriptsBridge } from "../shared/transcripts/preload-api";
import { setPlatformEarly } from "./platform-attr";
import { channel, METHODS, STATE_EVENT, UI_EVENT, type Api, type AppState, type UiEvent } from "../shared/ipc";

const api = Object.fromEntries(METHODS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(channel(m), ...args)])) as unknown as Api;
const subscribe = <T>(ch: string, cb: (v: T) => void) => {
  const h = (_: unknown, v: T) => cb(v);
  ipcRenderer.on(ch, h);
  return () => void ipcRenderer.off(ch, h);
};
api.onState = (cb) => subscribe<AppState>(STATE_EVENT, cb);
api.onUi = (cb) => subscribe<UiEvent>(UI_EVENT, cb);

contextBridge.exposeInMainWorld("speakkit", api);
contextBridge.exposeInMainWorld("speakkitLibrary", libraryBridge(ipcRenderer));
contextBridge.exposeInMainWorld("speakkitDictation", dictationBridge(ipcRenderer));
contextBridge.exposeInMainWorld("speakkitCapture", captureBridge(ipcRenderer));
contextBridge.exposeInMainWorld("speakkitMeetings", meetingsBridge(ipcRenderer));

contextBridge.exposeInMainWorld("speakkitPermissions", permissionsBridge(ipcRenderer));
contextBridge.exposeInMainWorld(
  "speakkitTranscripts",
  transcriptsBridge(ipcRenderer, (f) => webUtils.getPathForFile(f)),
);

setPlatformEarly(document, process.platform);
