import path from "node:path";
import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { EXTENSIONS } from "./contract";
import { registerLibraryIpc } from "./ipc";
import { createLibrary } from "./service";

export interface LibrarySetup {
  dataDir: string;
  window(): BrowserWindow | null;
  target(): { port: number; token: string };
}

/** Opens the library under userData/library and registers its IPC and the speak proxy. */
export async function setupLibrary({ dataDir, window, target }: LibrarySetup): Promise<void> {
  const library = await createLibrary({
    dir: path.join(dataDir, "library"),
    readClipboard: () => clipboard.readText(),
    reveal: (p) => shell.showItemInFolder(p),
    chooseFiles: async () => {
      const win = window();
      const opts = { properties: ["openFile", "multiSelections"] as ("openFile" | "multiSelections")[], filters: [{ name: "Readable files", extensions: [...EXTENSIONS] }] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? [] : r.filePaths;
    },
  });
  registerLibraryIpc({ ipcMain, library, target, trusted: (e) => !!window() && e.sender === window()!.webContents });
}
