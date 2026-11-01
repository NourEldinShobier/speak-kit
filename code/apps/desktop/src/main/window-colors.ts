import { nativeTokens } from "@speakkit/ui/tokens";

const palette = (dark: boolean) => nativeTokens[dark ? "dark" : "light"];

/** Behind the app window until its page paints. */
export const appBackground = (dark: boolean) => palette(dark).surfaceWindow;
/** Behind the mini player and the tray panel, which are drawn on the card surface. */
export const floatBackground = (dark: boolean) => palette(dark).surfaceCard;
/** Minimize, maximize and close glyphs in the title bar overlay. */
export const titleBarSymbol = (dark: boolean) => palette(dark).textSecondary;
