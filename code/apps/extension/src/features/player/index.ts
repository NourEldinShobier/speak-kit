import css from "./dock.css?inline";

/**
 * Player: the floating dock drawn in the Shadow DOM, the speed popover, and the transport controls and state hook shared by the
 * popup and side panel. Does not play audio (the offscreen document does) and keeps no state of its own beyond what it renders.
 */
export { usePlayerState } from "./hooks";
export { Scrubber, Transport } from "./Transport";
export { speedPopover } from "./speed-popover";
export { Dock } from "./dock";
/** Stylesheet of the dock, injected into the Shadow DOM. */
export const DOCK_CSS: string = css;
