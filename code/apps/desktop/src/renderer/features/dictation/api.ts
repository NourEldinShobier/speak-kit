export { dictation, patchDictation } from "../dictation-bridge";

/** The platform the preload put on the document root ("darwin", "win32"), for labels that name keys. */
export const platformName = (): string => (typeof document === "undefined" ? undefined : document.documentElement.dataset.platform) ?? "win32";
