import { clipboard } from "electron";
import type { Ctx } from "./context";
import type { createReading } from "./reader/service";
import { copyIsPrivate } from "./system/clipboard";
import { ClipboardWatcher } from "./system/clipboard-watch";
import type { ToastCenter } from "./toasts";

/** The "Copied text: read it?" prompt. It watches the clipboard only while Settings has it on; `sync` applies a change of that setting. */
export function setupClipboardPrompt(ctx: Ctx, toasts: ToastCenter, reading: ReturnType<typeof createReading>) {
  const watcher = new ClipboardWatcher({
    text: () => clipboard.readText(),
    isPrivate: copyIsPrivate,
    onCopy: (text) =>
      toasts.notify({
        event: "clipboard",
        taskKey: text.slice(0, 40),
        title: "Copied text: read it?",
        body: "Click to read it out loud. Turn this off in Settings.",
        onClick: () => void reading.readText(text, "clipboard"),
      }),
  });
  const sync = () => (ctx.config.clipboardPrompt ? watcher.start() : watcher.stop());
  sync();
  return { sync, stop: () => watcher.stop() };
}
