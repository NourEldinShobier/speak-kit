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

interface SettingsWatch {
  file: string;
  config: Config;
  /** The port is set by the environment for this run: an edit to it is ignored. */
  keepPort: boolean;
  apply(patch: Partial<Config>): void;
  activity(kind: "info", title: string, body: string): void;
  log: { warn(...a: unknown[]): void };
  publish(): void;
}

/** The settings file of the running app: valid edits are applied and noted in the bell and the log; a file that stays broken is noted and the running settings kept. */
export function watchSettings(w: SettingsWatch): { dispose(): void } {
  return watchConfigFile({
    file: w.file,
    current: () => w.config,
    keep: w.keepPort ? ["preferredPort"] : [],
    onEdit: (edit) => {
      if (edit.kind === "newer") return;
      w.activity("info", "Settings changed outside the app", `Picked up: ${edit.keys.join(", ")}.`);
      w.log.warn("settings file edited outside the app", edit.keys.join(","), edit.repaired.length ? `repaired: ${edit.repaired.join(",")}` : "");
      w.apply(edit.patch);
    },
    onUnreadable: () => {
      w.activity("info", "Settings file could not be read", "The file was edited and is not valid. The app keeps the settings it has.");
      w.log.warn("settings file edited outside the app is not valid; keeping the running settings");
      w.publish();
    },
  });
}
