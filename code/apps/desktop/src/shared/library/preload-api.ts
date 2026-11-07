import type { IpcRenderer } from "electron";
import { LIBRARY_METHODS, libraryChannel, PROXY_CANCEL, PROXY_CHUNK, PROXY_OPEN } from "./channels";
import type { LibraryBridge, ProxyChunk } from "./contract";

export function libraryBridge(ipc: IpcRenderer): LibraryBridge {
  const methods = Object.fromEntries(LIBRARY_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(libraryChannel(m), ...args)]));
  return {
    ...methods,
    proxyOpen: (req) => ipc.invoke(PROXY_OPEN, req),
    proxyCancel: (id) => ipc.send(PROXY_CANCEL, id),
    onProxyChunk: (cb) => {
      const h = (_: unknown, c: ProxyChunk) => cb(c);
      ipc.on(PROXY_CHUNK, h);
      return () => void ipc.off(PROXY_CHUNK, h);
    },
  } as LibraryBridge;
}
