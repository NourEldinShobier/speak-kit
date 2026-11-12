import Store from "electron-store";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { countDropped } from "../shared/dictation/settings";
import { parseConfig, type Config } from "../shared/schemas";
import { setAsideIfCorrupt } from "./set-aside";

interface ConfigStore {
  config: Config;
  save(): void;
  path: string;
  /** Where an unreadable config.json was moved to (the app then started from defaults), else null. */
  recovered: string | null;
  /** Dictation entries (words, modes, replacements) the file had that loading left out, and the copy of the file kept because of it. */
  dropped: { count: number; copy: string | null };
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

/** userData/config.json through electron-store (atomic writes), validated with valibot; a file that is not JSON is set aside as config.json.bad. SPEAKKIT_PORT overrides the stored port for this run. */
export async function openConfig(cwd: string): Promise<ConfigStore> {
  const recovered = await setAsideIfCorrupt(path.join(cwd, "config.json"));
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const config = parseConfig(store.store);
  const count = countDropped(store.store.dictation);
  const copy = count ? await keepCopy(store.path) : null;
  const envPort = Number(process.env.SPEAKKIT_PORT);
  if (envPort) config.preferredPort = envPort;
  return {
    config,
    path: store.path,
    recovered,
    dropped: { count, copy },
    save: () => {
      const keep = envPort ? { ...config, preferredPort: parseConfig(store.store).preferredPort } : config;
      store.set(keep as Record<string, unknown>);
    },
  };
}
