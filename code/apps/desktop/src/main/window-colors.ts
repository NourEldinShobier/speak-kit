import { nativeTokens } from "@speakkit/ui/tokens";

/** Behind the app window until its page paints. */
export const appBackground = () => nativeTokens.light.surfaceWindow;
/** Behind the setup window until its page paints: white like the page, so there is no grey flash. */
export const setupBackground = () => nativeTokens.light.surfaceCard;
/** Minimize, maximize and close glyphs in the title bar overlay. Windows draws them as 1 px strokes, so they use pure black (the strongest contrast), not a text token. */
export const titleBarSymbol = () => "#000000";
