import "../../../shared/i18n/packs/library";
import type { LibraryBridge } from "../../../shared/library/contract";

declare global {
  interface Window {
    speakkitLibrary: LibraryBridge;
  }
}

/** The preload's library bridge (window.speakkitLibrary). */
export const library: LibraryBridge = window.speakkitLibrary;
