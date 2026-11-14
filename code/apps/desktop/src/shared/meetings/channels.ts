/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const MEETINGS_METHODS = [
  "list",
  "get",
  "rename",
  "trash",
  "restore",
  "remove",
  "retry",
  "regenerateNotes",
  "applyVocabulary",
  "copyNew",
  "copyText",
  "writeFiles",
  "reveal",
  "start",
  "stop",
  "settings",
  "patchSettings",
  "setPolicy",
  "addApp",
  "removeApp",
  "chooseFolder",
  "openFolder",
  "devices",
  "push",
  "since",
  "ack",
] as const;
export type MeetingsMethod = (typeof MEETINGS_METHODS)[number];
export const meetingsChannel = (m: string) => `speakkit:meetings:${m}`;

/** Main to the app window: something changed, redraw. */
export const MEETINGS_EVENT = "speakkit:meetings:changed";

/** Hidden recorder page: commands in, samples and levels out. */
export const MREC_COMMAND = "speakkit:meetings:rec-command";
export const MREC_REPLY = "speakkit:meetings:rec-reply";
export const MREC_CHUNK = "speakkit:meetings:rec-chunk";
export const MREC_LEVEL = "speakkit:meetings:rec-level";
export const MREC_ENDED = "speakkit:meetings:rec-ended";
export const MREC_READY = "speakkit:meetings:rec-ready";

/** The capsule window: state in, answers out. */
export const CAPSULE_STATE = "speakkit:meetings:capsule-state";
export const CAPSULE_ACTION = "speakkit:meetings:capsule-action";
export const CAPSULE_INTERACTIVE = "speakkit:meetings:capsule-interactive";
export const CAPSULE_DRAG = "speakkit:meetings:capsule-drag";
export const CAPSULE_READY = "speakkit:meetings:capsule-ready";
