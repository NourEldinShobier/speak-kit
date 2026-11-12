import type { AreaName } from "../control/settings-registry";

/** A change of settings as the Settings pages name it: `capture.hotkey`... Kept apart from the registry so a page that only names keys does not bundle its schemas. */
export const areaChange = (area: AreaName | "dictation", patch: object): Record<string, unknown> => Object.fromEntries(Object.entries(patch).map(([k, x]) => [`${area}.${k}`, x]));
