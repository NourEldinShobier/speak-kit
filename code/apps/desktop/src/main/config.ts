import Store from "electron-store";
import path from "node:path";
import { parseConfig, type Config } from "../shared/schemas";
import { sortKeys } from "../shared/control/settings-registry";
import { keepInvalidAside } from "./config-repair";
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

/** The exact original bytes, kept once (an existing backup is never replaced), before the first save that repairs or migrates. Owner-only where the system has modes. */
async function backupOriginal(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    await chmod(to, 0o600);
  } catch {
    /* already backed up, or no file yet: saving settings must not depend on it */
  }
}

/** userData/config.json through electron-store (atomic writes), validated with valibot; a file that is not JSON is set aside as config.json.bad. SPEAKKIT_PORT overrides the stored port for this run. */
export async function openConfig(cwd: string): Promise<ConfigStore> {
  const recovered = await setAsideIfCorrupt(path.join(cwd, "config.json"));
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const config = parseConfig(store.store);
  // A field that had to be replaced by its default: the file as it was is kept next to it before the next save rewrites it.
  await keepInvalidAside(store.path, store.store, config).catch(() => null);
  const envPort = Number(process.env.SPEAKKIT_PORT);
  if (envPort) config.preferredPort = envPort;
  return {
    config,
    path: store.path,
    recovered,
    notice: noticeOf(loaded),
    save: () => {
      const keep = envPort ? { ...config, preferredPort: parseConfig(store.store).preferredPort } : config;
      store.set(sortKeys(keep) as Record<string, unknown>);
    },
  };
}
