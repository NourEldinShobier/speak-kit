/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const PERMISSION_IDS = ["accessibility", "input-monitoring", "microphone", "screen-recording"] as const;
export type PermissionId = (typeof PERMISSION_IDS)[number];

/**
 * Where one permission stands. "not-needed" means this operating system has no such permission (Windows has no Accessibility or Input Monitoring
 * switch); "unknown" means the system could not say.
 */
export type PermissionState = "granted" | "denied" | "not-determined" | "restricted" | "not-needed" | "unknown";

export const PERMISSION_METHODS = ["status", "request", "openSettings"] as const;
export type PermissionMethod = (typeof PERMISSION_METHODS)[number];
export const permissionChannel = (m: string) => `speakkit:permissions:${m}`;

/** Main to the app window: the status after every change. */
export const PERMISSIONS_EVENT = "speakkit:permissions:status";
