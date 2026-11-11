import { clipboard, ClipboardItem } from "electron";
import { CLIPBOARD_PRIVACY_MARKS, type InputPort } from "./types";
import type { ClipboardPort } from "./restore-guard";

type Parts = ConstructorParameters<typeof ClipboardItem>[0];
type Native = Pick<InputPort, "clipboardSequence" | "clipboardTraits" | "markClipboard">;

/** What was on the clipboard: the formats Electron can hand over, and the privacy marks the owner had set. */
interface Snapshot {
  items: Parts[];
  marks: readonly string[];
}

/**
 * The system clipboard through Electron. `read()` returns views onto the live clipboard, not copies, so a snapshot has to fetch every format
 * (text, HTML, image) at once; reading them after the clipboard changed would return the new content. Electron cannot copy a file list or
 * program-specific formats, so `restorable` says when a snapshot would lose content, and dictated text carries the privacy marks so clipboard
 * history and cloud sync do not keep it.
 */
export function createElectronClipboard(native: Native): ClipboardPort {
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
  const readItems = async (): Promise<Parts[]> => (await Promise.all((await clipboard.read()).map(fetchItem))).filter((parts) => Object.keys(parts).length > 0);

  return {
    snapshot: async () => {
      try {
        return { items: await readItems(), marks: native.clipboardTraits().marks } satisfies Snapshot;
      } catch {
        // Another program holds the clipboard open; without a snapshot nothing is restored, the dictated text stays.
        return null;
      }
    },
    writeText: async (text) => {
      clipboard.writeText(text);
      native.markClipboard(CLIPBOARD_PRIVACY_MARKS);
    },
    restore: async (snapshot) => {
      const { items, marks } = snapshot as Snapshot;
      if (!items.length) return clipboard.clear();
      await clipboard.write(items.map((parts) => new ClipboardItem(parts)));
      if (marks.length) native.markClipboard(marks);
    },
    restorable: async () => {
      const t = native.clipboardTraits();
      if (t.files) return false;
      if (t.formats === 0) return true;
      try {
        return (await readItems()).length > 0; // formats exist but none of them can be read: restoring would empty the clipboard
      } catch {
        return false;
      }
    },
    sequence: native.clipboardSequence,
  };
}
