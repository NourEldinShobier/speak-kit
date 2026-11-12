import Store from "electron-store";
import path from "node:path";
import { parseConfig, repairedKeys, type Config } from "../shared/schemas";
import { setAsideIfCorrupt } from "./set-aside";
import log from "electron-log/main";

interface ConfigStore {
  config: Config;
  save(): void;
  path: string;
  /** Where an unreadable config.json was moved to (the app then started from defaults), else null. */
  recovered: string | null;
}

/** userData/config.json through electron-store (atomic writes), validated with valibot; a file that is not JSON is set aside as config.json.bad. SPEAKKIT_PORT overrides the stored port for this run. */
export async function openConfig(cwd: string): Promise<ConfigStore> {
  const recovered = await setAsideIfCorrupt(path.join(cwd, "config.json"), (x) => !!x && typeof x === "object" && !Array.isArray(x));
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const config = parseConfig(store.store);
  const repaired = repairedKeys(store.store, config);
  if (repaired.length) log.warn("settings: invalid values replaced by defaults", repaired);
  const envPort = Number(process.env.SPEAKKIT_PORT);
  if (envPort) config.preferredPort = envPort;
  return {
    config,
    path: store.path,
    recovered,
    save: () => {
      const keep = envPort ? { ...config, preferredPort: parseConfig(store.store).preferredPort } : config;
      store.set(keep as Record<string, unknown>);
    },
  };
}
