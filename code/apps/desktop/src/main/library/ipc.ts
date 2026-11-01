import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import * as v from "valibot";
import { LIBRARY_ARGS, LIBRARY_METHODS, libraryChannel, PROXY_CANCEL, PROXY_CHUNK, PROXY_OPEN, ProxyRequestSchema, type LibraryApi } from "./contract";
import { createSpeakProxy } from "./speak-proxy";

export interface LibraryIpcDeps {
  ipcMain: IpcMain;
  library: LibraryApi;
  /** true when the event comes from the app window */
  trusted(e: IpcMainEvent | IpcMainInvokeEvent): boolean;
  target(): { port: number; token: string };
}

/** Registers the library handlers and the speak proxy. Every call is checked for sender and arguments before it runs. */
export function registerLibraryIpc({ ipcMain, library, trusted, target }: LibraryIpcDeps): void {
  for (const m of LIBRARY_METHODS)
    ipcMain.handle(libraryChannel(m), (e, ...args) => {
      if (!trusted(e)) throw new Error("Untrusted sender");
      const parsed = v.safeParse(LIBRARY_ARGS[m], args);
      if (!parsed.success) throw new Error(`Invalid arguments for ${m}`);
      return (library[m] as (...a: unknown[]) => unknown)(...parsed.output);
    });

  const proxy = createSpeakProxy({ target });
  ipcMain.handle(PROXY_OPEN, (e, req) => {
    if (!trusted(e)) throw new Error("Untrusted sender");
    const parsed = v.safeParse(ProxyRequestSchema, req);
    if (!parsed.success) throw new Error("Invalid proxy request");
    void proxy.open(parsed.output, (chunk) => !e.sender.isDestroyed() && e.sender.send(PROXY_CHUNK, chunk));
  });
  ipcMain.on(PROXY_CANCEL, (e, id) => {
    if (trusted(e) && typeof id === "number") proxy.cancel(id);
  });
}
