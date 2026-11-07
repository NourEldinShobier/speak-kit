/**
 * Which permission requests of a window are granted. The only grant is the microphone for the app's own main window (voice cloning,
 * "Record"): `media` with audio and nothing else, from the page the app loaded. Camera, screen capture, location, notifications,
 * clipboard reads and everything else stay denied.
 */
export interface PermissionAsk {
  permission: string;
  /** `details.mediaTypes` of a request, or `[details.mediaType]` of a check; empty when Chromium did not say. */
  mediaTypes: readonly string[];
  /** URL of the page that asks. */
  url: string;
  /** The window may use the microphone (the main window; the mini player may not). */
  microphoneWindow: boolean;
}

/** The app's pages are local files (`file:`); a web page can never be the requester because navigation is blocked. */
const isAppPage = (url: string) => url.startsWith("file://");

export function grantPermission(a: PermissionAsk): boolean {
  if (a.permission !== "media" || !a.microphoneWindow || !isAppPage(a.url)) return false;
  return a.mediaTypes.length > 0 && a.mediaTypes.every((t) => t === "audio");
}
