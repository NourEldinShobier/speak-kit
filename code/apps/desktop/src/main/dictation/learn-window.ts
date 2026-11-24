import type { Dictation } from "@speakkit/dictation";
import { electronClipboard } from "../system/clipboard";
import { sendCopyKeys } from "../system/keys";
import { captureSelection } from "../system/selection";
import type { DictationOs } from "./index";
import type { WindowPorts } from "./learn-correction";
import { isTerminal } from "./terminals";

/** The window the Learn correction key reads: the operating system's foreground checks and field read, the newest history entry, and a copy of the selection. */
export function selectionPort(h: { os(): DictationOs | undefined; core(): Dictation | undefined }): WindowPorts {
  return {
    async last() {
      const entry = (await h.core()?.history.list())?.find((e) => e.text.trim());
      return entry && { id: entry.id, text: entry.text, at: entry.at };
    },
    foreground: () => h.os()?.foreground() ?? null,
    passwordFocused: () => h.os()?.passwordFocused() ?? true,
    readValue: async () => h.os()?.caret?.readValue(),
    // The copy key is never sent into a terminal, whatever the caller decided.
    selection: async () => (isTerminal(h.os()?.foreground()?.exe) ? "" : captureSelection({ clip: electronClipboard, copy: sendCopyKeys, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })),
  };
}
