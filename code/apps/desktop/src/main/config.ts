import Store from "electron-store";
import path from "node:path";
import { chmodSync, copyFileSync, existsSync } from "node:fs";
import type { Config } from "../shared/schemas";
import { loadSettings, noticeOf, type SettingsNotice } from "../shared/settings/settings-file";
import { setAsideIfCorrupt } from "./set-aside";

interface ConfigStore {
  config: Config;
  save(): void;
  path: string;
  /** Where an unreadable config.json was moved to (the app then started from defaults), else null. */
  recovered: string | null;
  /** Bad fields repaired or a file from a newer app, for the banner in Settings. */
  notice: SettingsNotice | null;
}

const BACKUP = "config.backup.json";

/** userData/config.json through electron-store (atomic writes), validated with valibot; a file that is not JSON is set aside as config.json.bad. SPEAKKIT_PORT overrides the stored port for this run. */
export async function openConfig(cwd: string): Promise<ConfigStore> {
  const recovered = await setAsideIfCorrupt(path.join(cwd, "config.json"));
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const loaded = loadSettings(store.store);
  const config = loaded.config;
  let backedUp = !loaded.needsBackup;
  const envPort = Number(process.env.SPEAKKIT_PORT);
  if (envPort) config.preferredPort = envPort;
  return {
    config,
    path: store.path,
    recovered,
    notice: noticeOf(loaded),
    save: () => {
      // A file from a newer app is never rewritten. The exact original bytes are kept once, before the first save that repairs or migrates.
      if (loaded.newerVersion !== null) return;
      if (!backedUp) {
        backedUp = true;
        const target = path.join(cwd, BACKUP);
        if (!existsSync(target) && existsSync(store.path)) {
          try {
            copyFileSync(store.path, target); // synchronous: the save below must not overwrite the original first
            chmodSync(target, 0o600);
          } catch {
            /* a backup that cannot be written must not block saving settings */
          }
        }
      }
      const keep = envPort ? { ...config, preferredPort: loadSettings(store.store).config.preferredPort } : config;
      store.set(keep as Record<string, unknown>);
    },
  };
}
