import type { Config } from "../shared/schemas";
import { watchConfigFile } from "./config-watch";
import { applyExternalConfig, type HandlerDeps } from "./handlers";

/**
 * The settings file of the running app: a valid edit is applied (the file already holds it) and noted in the bell and the log; a file
 * that stays broken is noted and the running settings are kept.
 */
export function watchSettings(d: HandlerDeps, file: string, log: { warn(...a: unknown[]): void }): { dispose(): void } {
  return watchConfigFile({
    file,
    current: () => d.config,
    keep: process.env.SPEAKKIT_PORT ? ["preferredPort"] : [], // this run's port comes from the environment, not from the file
    onEdit: (edit) => {
      if (edit.kind === "newer") return;
      d.addActivity("info", "Settings changed outside the app", `Picked up: ${edit.keys.join(", ")}.`);
      log.warn("settings file edited outside the app", edit.keys.join(","), edit.repaired.length ? `repaired: ${edit.repaired.join(",")}` : "");
      applyExternalConfig(d, edit.patch as Partial<Config>);
    },
    onUnreadable: () => {
      d.addActivity("info", "Settings file could not be read", "The file was edited and is not valid. The app keeps the settings it has.");
      log.warn("settings file edited outside the app is not valid; keeping the running settings");
      d.publish();
    },
  });
}
