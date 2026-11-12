import type { AreaName } from "../shared/control/settings-registry";
import { areaChange } from "../shared/settings/area-change";

/**
 * Changes the settings of a feature through the settings registry, the one validator the Settings pages, the command line and an import share,
 * then reads the feature's status again. A refusal throws its message unless `read.explained` says the status already shows it (a shortcut that clashes).
 */
export async function patchViaRegistry<S>(area: AreaName | "dictation", patch: object, read: { status: () => Promise<S>; explained?: (s: S) => boolean }): Promise<S> {
  const r = await window.speakkit.applySettings(areaChange(area, patch));
  const now = await read.status();
  if (!r.ok && !read.explained?.(now)) throw new Error(r.message);
  return now;
}
