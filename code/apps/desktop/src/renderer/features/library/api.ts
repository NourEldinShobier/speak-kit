import type { LibraryBridge } from "../../../main/library/contract";

declare global {
  interface Window {
    speakkitLibrary: LibraryBridge;
  }
}

/** The preload's library bridge (window.speakkitLibrary). */
export const library: LibraryBridge = window.speakkitLibrary;
