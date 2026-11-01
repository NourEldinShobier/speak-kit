import { parseConfig } from "../shared/schemas";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { AppState } from "../shared/ipc";

/** A state as main publishes it, with every field filled; tests override what they look at. */
export const appState = (over: Partial<AppState> = {}): AppState => ({
  version: "0.2.0",
  platform: "win32",
  port: 47615,
  portFallback: false,
  token: "test-token",
  health: null,
  serverError: null,
  config: parseConfig({ setupDone: true }),
  launchAtLogin: false,
  onBattery: false,
  pairing: { firstSeenMs: null, lastSeenMs: null, origin: null },
  activity: [],
  reader: IDLE_READER,
  shortcuts: { bindings: parseConfig({}).shortcuts, conflicts: {} },
  update: UPDATE_UNSUPPORTED,
  exports: [],
  exportDir: "C:/Users/test/Music/Speak Kit",
  packaged: false,
  ...over,
});
