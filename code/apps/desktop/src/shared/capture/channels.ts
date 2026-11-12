/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const CAPTURE_METHODS = [
  "status",
  "setEnabled",
  "patchSettings",
  "list",
  "detail",
  "copy",
  "reveal",
  "remove",
  "start",
  "stop",
  "discard",
  "noticeAction",
  "dismissNotice",
  "dismissRecovery",
  "chooseFolder",
] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];
export const captureChannel = (m: string) => `speakkit:capture:${m}`;

/** Main to the app window: the status after every change. */
export const CAPTURE_STATUS_EVENT = "speakkit:capture:status";

/** Main to the capsule page: what to draw; the page answers with a button id. */
export const CAPSULE_EVENT = "speakkit:capture:capsule";
export const CAPSULE_ACTION = "speakkit:capture:capsule-action";

/** Main to the picker overlay: the targets to show; the overlay answers with the choice, or null when cancelled. */
export const OVERLAY_EVENT = "speakkit:capture:overlay";
export const OVERLAY_RESULT = "speakkit:capture:overlay-result";

/** Recorder window: main sends commands, the window answers each one and streams what it records. */
export const REC_COMMAND = "speakkit:capture:rec-command";
export const REC_REPLY = "speakkit:capture:rec-reply";
export const REC_DATA = "speakkit:capture:rec-data";
export const REC_READY = "speakkit:capture:rec-ready";
