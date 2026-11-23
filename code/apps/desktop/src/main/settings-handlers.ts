import { shell, systemPreferences } from "electron";
import path from "node:path";
import type { Api, AppState, ExternalLink } from "../shared/ipc";
import { RELEASES_PAGE } from "./updates";
import { logSince } from "./log-tail";
import { createPermissions } from "./permissions";

interface SettingsDeps {
  state: AppState;
  logsDir: string;
  publish(): AppState;
}

/** Links the Settings pages may open; the renderer only names one. */
export const SETTINGS_LINKS: Record<Exclude<ExternalLink, "webstore">, string> = {
  "release-notes": RELEASES_PAGE,
  issues: "https://github.com/NourEldinShobier/speak-kit/issues",
  security: "https://github.com/NourEldinShobier/speak-kit/security/advisories/new",
};

/** The IPC methods of the Settings pages that need the operating system: the log tail and permissions. */
export function createSettingsHandlers(d: SettingsDeps) {
  const logFile = path.join(d.logsDir, "main.log");
  const permissions = createPermissions(process.platform, systemPreferences);
  return {
    diagnosticsLog: (since) => logSince(logFile, since),
    dismissSettingsNotice: async () => {
      if (d.state.settingsNotice?.kind === "newer") return d.publish(); // edits are being discarded; the warning stays
      d.state.settingsNotice = null;
      return d.publish();
    },
    micAccess: async () => permissions.micStatus(),
    openSystemSettings: async () => {
      const url = permissions.micSettingsUrl();
      if (url) await shell.openExternal(url);
      return url !== null;
    },
  } satisfies Partial<{ [K in keyof Api]: Api[K] }>;
}
