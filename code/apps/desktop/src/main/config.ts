import Store from "electron-store";
import path from "node:path";
import { chmod, constants, copyFile } from "node:fs/promises";
import type { Config } from "../shared/schemas";
import { countDropped } from "../shared/dictation/settings";
import { loadSettings, noticeOf, type SettingsNotice } from "../shared/settings/settings-file";
import { sortKeys } from "../shared/control/settings-registry";
import { setAsideIfCorrupt } from "./set-aside";

interface ConfigStore {
  config: Config;
  save(): void;
  path: string;
  /** Where an unreadable config.json was moved to (the app then started from defaults), else null. */
  recovered: string | null;
  /** Bad fields repaired or a file from a newer app, for the banner in Settings. */
  notice: SettingsNotice | null;
  /** Dictation entries (words, modes, replacements, corrections) the file had that loading left out, and the copy of the file kept because of it. */
  dropped: { count: number; copy: string | null };
}

const BACKUP = "config.backup.json";

/** The exact original bytes, kept once (an existing backup is never replaced), before the first save that repairs or migrates. Owner-only where the system has modes. */
async function backupOriginal(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    await chmod(to, 0o600);
  } catch {
    /* already backed up, or no file yet: saving settings must not depend on it */
  }
}

/** config.json as it is, next to itself, before a save writes it without the entries that were dropped. */
async function keepCopy(file: string): Promise<string | null> {
  const copy = file.replace(/\.json$/, `.dropped-${Date.now()}.json`);
  try {
    await copyFile(file, copy);
    return copy;
  } catch {
    return null;
  }
}

/** userData/config.json through electron-store (atomic writes), validated with valibot; a file that is not JSON is set aside as config.json.bad. */
export async function openConfig(cwd: string): Promise<ConfigStore> {
  const recovered = await setAsideIfCorrupt(path.join(cwd, "config.json"));
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const loaded = loadSettings(store.store);
  const config = loaded.config;
  if (loaded.needsBackup) await backupOriginal(store.path, path.join(cwd, BACKUP));
  const count = countDropped(store.store.dictation);
  const copy = count ? await keepCopy(store.path) : null;
  return {
    config,
    path: store.path,
    recovered,
    notice: noticeOf(loaded),
    dropped: { count, copy },
    save: () => {
      // A file from a newer app is never rewritten.
      if (loaded.newerVersion !== null) return;
      store.set(sortKeys(config) as Record<string, unknown>);
    },
  };
}

/** The Activity line for dictation entries (words, modes, replacements, corrections) that loading left out; none when nothing was. */
export function droppedNotices({ count, copy }: { count: number; copy: string | null }): { title: string; body: string }[] {
  if (!count) return [];
  const kept = copy ? ` The old file is kept as ${path.basename(copy)}.` : "";
  return [
    {
      title: `${count} dictation ${count === 1 ? "entry" : "entries"} could not be read`,
      body: `Words, modes, replacements or corrections in Settings were broken or repeated and were left out.${kept}`,
    },
  ];
}
