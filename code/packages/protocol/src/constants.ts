export const APP_ID = "speakkit" as const;
/** Version of the /v1 wire format. A bump must keep the previous version (N-1) served for one release, so an updated app still answers an older extension and the reverse; `version-mismatch` is reported only beyond that. */
export const API_VERSION = 1 as const;
/** Loopback port the desktop app (or the standalone server) listens on. Fixed so the extension needs no discovery. */
export const DEFAULT_PORT = 47615;
export const LOOPBACK_HOST = "127.0.0.1";
export const SAMPLE_RATE = 24000;
export const FRAMES_CONTENT_TYPE = "application/vnd.speakkit.frames";
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
export const DEFAULT_VOICE = "af_heart";
