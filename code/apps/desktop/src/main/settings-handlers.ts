import { app, shell, systemPreferences } from "electron";
import os from "node:os";
import path from "node:path";
import type { Activity, Api, AppState, ExternalLink } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import type { Config } from "../shared/schemas";
import { buildReport } from "../shared/settings/diagnostics";
import { RELEASES_PAGE } from "./updates";
import { logSince, readLogTail } from "./log-tail";
import { createPermissions } from "./permissions";

interface SettingsDeps {
  state: AppState;
  config: Config;
  logsDir: string;
  publish(): AppState;
}

/** Links the Settings pages may open; the renderer only names one. */
export const SETTINGS_LINKS: Record<Exclude<ExternalLink, "webstore">, string> = {
  "release-notes": RELEASES_PAGE,
  issues: "https://github.com/NourEldinShobier/speak-kit/issues",
  security: "https://github.com/NourEldinShobier/speak-kit/security/advisories/new",
};

const SUPPORT_KEYS = ["language", "idleUnload", "loadAtStart", "batterySaver", "autoUpdate", "updateChannel", "closeAction", "hideTrayIcon", "reduceMotion", "setupDone"] as const;

function listener(s: AppState): string {
  if (s.serverError) return `not running (${s.serverError.code})`;
  return s.port ? `listening on port ${s.port}${s.portFallback ? " (preferred port was busy)" : ""}` : "starting";
}

/** The IPC methods of the Settings pages that need the operating system: diagnostics, permissions, restart. */
export function createSettingsHandlers(d: SettingsDeps) {
  const logFile = path.join(d.logsDir, "main.log");
  const permissions = createPermissions(process.platform, systemPreferences);
  return {
    diagnosticsLog: (since) => logSince(logFile, since),
    diagnosticsReport: async () => {
      const cpus = os.cpus();
      const { lines } = await readLogTail(logFile, 40);
      const s = d.state;
      return buildReport(
        {
          version: s.version,
          platform: s.platform,
          arch: process.arch,
          osVersion: os.release(),
          cpu: cpus[0]?.model.trim() ?? "unknown",
          cores: cpus.length,
          ramGb: Math.round(os.totalmem() / 2 ** 30),
          packaged: s.packaged,
          engine: engineView(s.health, s.serverError).label,
          listener: listener(s),
          updateChannel: d.config.updateChannel,
          settings: Object.fromEntries(SUPPORT_KEYS.map((k) => [k, d.config[k]])) as Record<string, string | number | boolean>,
          activity: [...s.activity].reverse(),
          logTail: lines,
        },
        { home: os.homedir(), user: os.userInfo().username },
      );
    },
    clearActivity: async () => {
      d.state.activity = [] as Activity[];
      return d.publish();
    },
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
    restartApp: async () => {
      app.relaunch();
      app.exit(0);
    },
  } satisfies Partial<{ [K in keyof Api]: Api[K] }>;
}
