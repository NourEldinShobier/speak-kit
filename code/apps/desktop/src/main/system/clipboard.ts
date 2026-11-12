import { clipboard, ClipboardItem } from "electron";
import type { ClipboardIO } from "./selection";

type Parts = ConstructorParameters<typeof ClipboardItem>[0];

/** Every format of every item, fetched at once: `read()` hands out views onto the live clipboard, and Electron refuses to write those back. */
async function copyOf(items: ClipboardItem[]): Promise<Parts[]> {
  return Promise.all(
    items.map(async (item) => {
      const parts: Parts = {};
      for (const type of item.types) {
        try {
          parts[type] = await item.getType(type);
        } catch {
          // A format Electron lists but cannot hand over is left out; the rest is still restored.
        }
      }
      return parts;
    }),
  );
}

/** The real clipboard, used only by the selection reader (read-selection): it sends Ctrl+C, reads the result and restores the previous clipboard. Nothing else reads it (no-clipboard-read.test.ts). A snapshot is a copy of every format, so restoring gives back what was there. */
export const electronClipboard: ClipboardIO = {
  text: () => clipboard.readText(),
  snapshot: async () => copyOf(await clipboard.read()),
  restore: async (snapshot) => {
    const copies = (snapshot as Parts[]).filter((parts) => Object.keys(parts).length > 0);
    if (copies.length) await clipboard.write(copies.map((parts) => new ClipboardItem(parts)));
    else clipboard.clear();
  },
  clear: () => clipboard.clear(),
};
