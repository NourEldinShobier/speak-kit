import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../shared/schemas";
import { readExternalEdit, type ExternalEdit } from "../shared/settings/external-edit";

interface WatchOptions {
  /** The settings file. */
  file: string;
  /** What the app holds right now. */
  current(): Config;
  /** Fields this run owns (a port set by the environment): an edit to them is ignored. */
  keep?: readonly string[];
  /** Called for a change that matters; "same" and half-written files are not reported. */
  onEdit(edit: Exclude<ExternalEdit, { kind: "same" } | { kind: "unreadable" }>): void;
  /** Called once a file stays unreadable after it settled. */
  onUnreadable?(): void;
  /** Quiet time after the last file event before the file is read. */
  debounceMs?: number;
}

/** Picks up edits made to config.json while the app runs (a text editor, a sync tool). The app's own saves match what it holds and are ignored. */
export function watchConfigFile(o: WatchOptions): { dispose(): void } {
  const dir = path.dirname(o.file);
  const name = path.basename(o.file);
  let timer: NodeJS.Timeout | undefined;
  let badSince = 0;
  const check = async () => {
    let text: string;
    try {
      text = await readFile(o.file, "utf8");
    } catch {
      return; // being replaced: the next event reads it
    }
    const edit = readExternalEdit(o.current(), text, o.keep);
    if (edit.kind === "same") badSince = 0;
    else if (edit.kind === "unreadable") {
      // An editor saving in two steps leaves a broken file for a moment; only a file that is still broken at the next check is reported.
      if (badSince) o.onUnreadable?.();
      badSince = Date.now();
      timer = setTimeout(() => void check(), (o.debounceMs ?? 400) * 2);
    } else {
      badSince = 0;
      o.onEdit(edit);
    }
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(dir, (_event, file) => {
      if (file && file !== name) return;
      clearTimeout(timer);
      timer = setTimeout(() => void check(), o.debounceMs ?? 400);
    });
    watcher.on("error", () => watcher?.close());
  } catch {
    /* no folder to watch: edits are picked up at the next start */
  }
  return {
    dispose: () => {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
