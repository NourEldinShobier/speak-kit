import css from "./launcher.css?inline";

/**
 * Launcher: the in-page surfaces drawn in the Shadow DOM (edge tab and pill, selection bubble, paragraph button, toast, back pill)
 * and their options-page sections. Does not own playback or settings; it calls the handlers it is given. Area: extension content script.
 */
export { Launcher } from "./launcher";
export { LauncherSection, AppearsCard } from "./LauncherSection";
/** Stylesheet of the launcher surfaces, injected into the Shadow DOM. */
export const LAUNCHER_CSS: string = css;
