import { clipboard, dialog, shell } from "electron";
import { open, readFile, stat } from "node:fs/promises";
import type { FilePorts } from "./decode";
import type { TranscriptsPorts } from "./service";

/** What a test sets instead of using the real file chooser, the file manager and the clipboard, and what it reads back. */
export class TestSwitches {
  nextPick: string | null | undefined;
  nextFolder: string | null | undefined;
  micDenied = false;
  readonly revealed: string[] = [];
  readonly recycled: string[] = [];
  copied = "";
}

/** Files on the disk. The first bytes are read without reading the whole file. */
export function diskFiles(decodeInPage: FilePorts["decodeInPage"]): FilePorts {
  return {
    stat: (f) => stat(f).then((s) => (s.isFile() ? { size: s.size } : undefined)),
    async head(f, n) {
      const h = await open(f, "r");
      try {
        const buf = new Uint8Array(n);
        const { bytesRead } = await h.read(buf, 0, n, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await h.close();
      }
    },
    read: (f) => readFile(f),
    decodeInPage,
    pause: () => new Promise((r) => setImmediate(r)),
  };
}

const AUDIO_FILTERS = [
  { name: "Audio", extensions: ["wav", "mp3", "m4a", "mp4", "flac", "ogg", "oga", "opus", "aac"] },
  { name: "All files", extensions: ["*"] },
];

/** The file and folder choosers; with the test hook on, a test's answer replaces the dialog. */
export function dialogs(test: boolean, sw: TestSwitches): TranscriptsPorts["dialog"] {
  const answer = async (options: Electron.OpenDialogOptions): Promise<string | null> => {
    const r = await dialog.showOpenDialog(options);
    return r.canceled ? null : (r.filePaths[0] ?? null);
  };
  return {
    pickFile: async () => (test && sw.nextPick !== undefined ? sw.nextPick : answer({ properties: ["openFile"], filters: AUDIO_FILTERS })),
    pickFolder: async () => (test && sw.nextFolder !== undefined ? sw.nextFolder : answer({ properties: ["openDirectory", "createDirectory"] })),
  };
}

/** Show in folder, open a folder and the clipboard; with the test hook on they are recorded instead. */
export function systemPorts(test: boolean, sw: TestSwitches): Pick<TranscriptsPorts, "shell" | "clipboard"> {
  return {
    shell: {
      reveal: (file) => (test ? void sw.revealed.push(file) : shell.showItemInFolder(file)),
      trash: async (file) => (test ? void sw.recycled.push(file) : shell.trashItem(file)),
      openFolder: async (dir) => void (await shell.openPath(dir)),
    },
    clipboard: { writeText: (t) => (test ? void (sw.copied = t) : clipboard.writeText(t)) },
  };
}
