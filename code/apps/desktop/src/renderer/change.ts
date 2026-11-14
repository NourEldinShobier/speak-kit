import type { SystemPatch } from "../shared/control/settings-registry";
import type { ConfigPatch } from "../shared/ipc";
import { api } from "./ui";

async function apply(change: Record<string, unknown>): Promise<void> {
  const r = await api.applySettings(change);
  if (!r.ok) throw new Error(r.message);
}

/** Changes app settings through the settings registry, the same validator the command line uses; a refusal throws its message. */
export const change = (patch: ConfigPatch): Promise<void> => apply(patch);

/** Puts every shortcut back to its default. */
export const resetShortcuts = (): Promise<void> => apply({ shortcuts: "default" });

/** The settings of this computer that are not in the settings file: the login item and the server port. */
export const changeSystem = (patch: SystemPatch): Promise<void> => apply(patch);
