import path from "node:path";
import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { EXTENSIONS } from "../../shared/library/contract";
import { registerLibraryIpc } from "./ipc";
import { parseInWorker } from "./parse/parse-runner";
import { createLibrary } from "./service";

interface LibrarySetup {
  dataDir: string;
  window(): BrowserWindow | null;
  target(): { port: number; token: string };
  /** Tests only: pages on this machine may be read (the e2e web server is on loopback). */
  allowLocalUrls?: boolean;
  /** Directory of the bundled main-process files (parse-worker.js sits next to index.js). */
  distDir: string;
  onRecovered(file: string): void;
}

/** Opens the library under userData/library and registers its IPC and the speak proxy. */
export async function setupLibrary({ dataDir, window, target, allowLocalUrls, onRecovered, distDir }: LibrarySetup): Promise<void> {
  const library = await createLibrary({
    dir: path.join(dataDir, "library"),
    onRecovered,
    parse: parseInWorker(new URL("./parse-worker.js", `file://${path.resolve(distDir)}/`)),
    readClipboard: () => clipboard.readText(),
    reveal: (p) => shell.showItemInFolder(p),
    ...(allowLocalUrls && { fetch }),
    chooseFiles: async () => {
      const win = window();
      const opts = { properties: ["openFile", "multiSelections"] as ("openFile" | "multiSelections")[], filters: [{ name: "Readable files", extensions: [...EXTENSIONS] }] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? [] : r.filePaths;
    },
  });
  registerLibraryIpc({ ipcMain, library, target, trusted: (e) => !!window() && e.sender === window()!.webContents });
}
