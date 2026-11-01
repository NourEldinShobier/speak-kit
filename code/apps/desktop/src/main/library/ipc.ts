import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import * as v from "valibot";
import { LIBRARY_ARGS, LIBRARY_METHODS, libraryChannel, PROXY_CANCEL, PROXY_CHUNK, PROXY_OPEN, ProxyRequestSchema, type LibraryApi } from "../../shared/library/contract";
import { registerValidatedIpc } from "../ipc-register";
import { createSpeakProxy } from "./speak-proxy";

interface LibraryIpcDeps {
  ipcMain: IpcMain;
  library: LibraryApi;
  /** true when the event comes from the app window */
  trusted(e: IpcMainEvent | IpcMainInvokeEvent): boolean;
  target(): { port: number; token: string };
}

/** Registers the library handlers and the speak proxy. Every call is checked for sender and arguments before it runs. */
export function registerLibraryIpc({ ipcMain, library, trusted, target }: LibraryIpcDeps): void {
  registerValidatedIpc<(typeof LIBRARY_METHODS)[number]>(ipcMain, {
    methods: LIBRARY_METHODS,
    channel: libraryChannel,
    args: LIBRARY_ARGS,
    handler: (m) => library[m] as (...a: unknown[]) => unknown,
    trusted,
  });

  const proxy = createSpeakProxy({ target });
  const watched = new WeakSet<object>();
  ipcMain.handle(PROXY_OPEN, (e, req) => {
    if (!trusted(e)) throw new Error("Untrusted sender");
    if (!watched.has(e.sender)) {
      watched.add(e.sender);
      e.sender.once("destroyed", () => proxy.cancelAll()); // the window is gone: stop what it started
    }
    const parsed = v.safeParse(ProxyRequestSchema, req);
    if (!parsed.success) throw new Error("Invalid proxy request");
    void proxy.open(parsed.output, (chunk) => !e.sender.isDestroyed() && e.sender.send(PROXY_CHUNK, chunk));
  });
  ipcMain.on(PROXY_CANCEL, (e, id) => {
    if (trusted(e) && typeof id === "number") proxy.cancel(id);
  });
}
