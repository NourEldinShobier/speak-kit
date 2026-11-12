import { watch } from "node:fs";
import { LAB_IDS, type LabsState } from "../shared/labs";
import type { Config } from "../shared/schemas";
import { readLabs } from "./labs-cli";

interface Watch {
  dir: string;
  /** The labs on disk, or null when the settings file cannot be read. */
  read(): Promise<LabsState | null>;
  /** The labs the app runs with now. */
  current(): LabsState;
  apply(labs: LabsState): void;
  warn(message: string): void;
  /** Wait after the last file event before reading, so a write in several steps is read once. Default 150. */
  delayMs?: number;
}

const same = (a: LabsState, b: LabsState) => LAB_IDS.every((id) => a[id] === b[id]);

/**
 * Follows the settings file for changes the app did not make (the speakkit command, a hand edit): when the labs on disk differ from the
 * running ones they are applied. The app's own saves arrive here too and are ignored because nothing differs. Returns the stop function.
 */
export function watchLabsFile(o: Watch): () => void {
  let timer: NodeJS.Timeout | undefined;
  let warned = false;
  const check = async () => {
    try {
      const labs = await o.read();
      if (!labs) {
        if (!warned) o.warn("labs: the settings file could not be read; keeping the current labs");
        warned = true;
        return;
      }
      warned = false;
      if (!same(labs, o.current())) o.apply(labs);
    } catch (e) {
      o.warn(`labs: re-reading the settings failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(o.dir, { persistent: false }, (_event, name) => {
      if (name && name !== "config.json") return;
      clearTimeout(timer);
      timer = setTimeout(() => void check(), o.delayMs ?? 150);
    });
    watcher.on("error", (e) => o.warn(`labs: watching the settings file failed: ${e.message}`));
  } catch (e) {
    o.warn(`labs: not watching the settings file: ${e instanceof Error ? e.message : String(e)}`);
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}

interface Labs {
  config: Config;
  dataDir: string;
  /** The detailed-log lab changed. */
  setVerbose(on: boolean): void;
  /** Labs changed in the file by something other than this window: the rest of the app reacts. */
  afterChange(labs: LabsState): void;
  warn(message: string): void;
}

/** The labs at run time: `apply` puts the current ones to work (the log level); `watch` follows the settings file for changes made elsewhere. */
export function setupLabs(o: Labs) {
  const apply = () => o.setVerbose(o.config.labs["verbose-log"]);
  apply();
  const applyFromDisk = (labs: LabsState) => {
    Object.assign(o.config.labs, labs);
    apply();
    o.afterChange(labs);
  };
  return { apply, watch: () => watchLabsFile({ dir: o.dataDir, read: () => readLabs(o.dataDir), current: () => o.config.labs, apply: applyFromDisk, warn: o.warn }) };
}
