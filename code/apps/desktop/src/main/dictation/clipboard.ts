import { clipboard, ClipboardItem } from "electron";
import type { ClipboardPort } from "./restore-guard";

type Parts = ConstructorParameters<typeof ClipboardItem>[0];

/**
 * The system clipboard through Electron. `read()` returns views onto the live clipboard, not copies, so a snapshot has to fetch every format
 * (text, HTML, image) at once; reading them after the clipboard changed would return the new content.
 */
export function createElectronClipboard(sequence: () => number): ClipboardPort {
  const fetchItem = async (item: ClipboardItem): Promise<Parts> => {
    const parts: Parts = {};
    for (const type of item.types) {
      try {
        parts[type] = await item.getType(type);
      } catch {
        // A format Electron lists but cannot hand over: it is left out of the snapshot, the rest is still restored.
      }
    }
    return parts;
  };

  return {
    snapshot: async () => {
      try {
        const items = await Promise.all((await clipboard.read()).map(fetchItem));
        return items.filter((parts) => Object.keys(parts).length > 0);
      } catch {
        // Another program holds the clipboard open; without a snapshot nothing is restored, the dictated text stays.
        return null;
      }
    },
    writeText: (text) => clipboard.writeText(text),
    restore: async (snapshot) => {
      const items = snapshot as Parts[];
      if (items.length) await clipboard.write(items.map((parts) => new ClipboardItem(parts)));
      else clipboard.clear();
    },
    sequence,
  };
}
