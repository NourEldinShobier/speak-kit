/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const TRANSCRIPTS_METHODS = [
  "list",
  "get",
  "pickFile",
  "checkFile",
  "importFile",
  "cancel",
  "resume",
  "writeNotes",
  "rename",
  "remove",
  "copyText",
  "deleteAudio",
  "deleteAllAudio",
  "settings",
  "patchSettings",
  "push",
] as const;
export type TranscriptsMethod = (typeof TRANSCRIPTS_METHODS)[number];
export const transcriptsChannel = (m: string) => `speakkit:transcripts:${m}`;

/** Main to the app window: something changed, redraw (the payload is the small live state; lists are fetched). */
export const TRANSCRIPTS_EVENT = "speakkit:transcripts:changed";

/** Hidden decoder page: main sends the file, the page answers with 16 kHz mono samples. */
export const DEC_COMMAND = "speakkit:transcripts:dec-command";
export const DEC_REPLY = "speakkit:transcripts:dec-reply";
export const DEC_READY = "speakkit:transcripts:dec-ready";
