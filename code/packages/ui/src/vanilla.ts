/**
 * Vanilla (no React) builders that produce the same markup as the React components, for the content script
 * (Shadow DOM). Styles: inject lumen.css into the shadow root and put class "lm" on the container.
 * Icons are built with createElementNS (no innerHTML), so Trusted Types pages are fine.
 */
export { h, icon, type Props } from "./vanilla/dom";
export { button, iconButton, segmented, slider, toggle } from "./vanilla/controls";
export type { ButtonOptions, ButtonVariant, IconButtonOptions, SegmentedHandle, SegmentedOptions, SliderHandle, SliderOptions, ToggleOptions } from "./vanilla/controls";
export { avatar, kbd, logo, pill, progress, tooltip } from "./vanilla/display";
export type { PillTone, ProgressHandle } from "./vanilla/display";
export { menu, menuItem, popoverSurface } from "./vanilla/menu";
export type { MenuItemOptions } from "./vanilla/menu";
export { browserPlatform } from "./platform";
