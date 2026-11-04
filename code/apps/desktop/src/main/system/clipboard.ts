import { clipboard, type ClipboardItem } from "electron";
import type { ClipboardIO } from "./selection";

/** The real clipboard. Electron 45's clipboard is promise based and hands back every format, so a snapshot restores everything. */
export const electronClipboard: ClipboardIO = {
  text: () => clipboard.readText(),
  snapshot: () => clipboard.read(),
  restore: async (items) => {
    const list = items as ClipboardItem[];
    if (list.length) await clipboard.write(list);
    else clipboard.clear();
  },
  clear: () => clipboard.clear(),
};
