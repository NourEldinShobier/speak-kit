import { contextBridge, ipcRenderer } from "electron";
import { libraryBridge } from "../shared/library/preload-api";
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
