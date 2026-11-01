import Store from "electron-store";
import { parseConfig, type Config } from "../shared/schemas";

interface ConfigStore {
  config: Config;
  save(): void;
  path: string;
}

/** userData/config.json through electron-store (atomic writes), validated with valibot. SPEAKKIT_PORT overrides the stored port for this run. */
export function openConfig(cwd: string): ConfigStore {
  const store = new Store<Record<string, unknown>>({ name: "config", cwd, clearInvalidConfig: false });
  const config = parseConfig(store.store);
  const envPort = Number(process.env.SPEAKKIT_PORT);
  if (envPort) config.preferredPort = envPort;
  return {
    config,
    path: store.path,
    save: () => {
      const keep = envPort ? { ...config, preferredPort: parseConfig(store.store).preferredPort } : config;
      store.set(keep as Record<string, unknown>);
    },
  };
}
