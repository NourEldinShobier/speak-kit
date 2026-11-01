export * from "@speakkit/player";
export { usePlayerState } from "./hooks";
export { Scrubber, Transport, type TransportActions, type TransportStatus } from "./Transport";
export { speedPopover, SPEED_PRESETS, type SpeedPopoverOptions } from "./speed-popover";
import css from "./dock.css?inline";

export { Dock } from "./dock";
export const DOCK_CSS: string = css;
