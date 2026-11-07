/**
 * Gapless streaming playback shared by the extension's offscreen document and the desktop reader.
 * It requests speech from the local server, schedules it on an AudioContext and reports state and sentence starts.
 * It does not draw UI, pick voices or start the server.
 */
export { Player } from "./player";
export { IDLE_CLOSE_MS } from "./lifecycle";
export { mapHttpError } from "./errors";
export { playbackRateFor } from "./rate";
export { soundTouchStretch } from "./stretch";
export { splitSentences, type SentenceSpan } from "./sentences";
export type { BufferLike, CtxLike, PlayerDeps, SourceLike, StretchDeps, StretchNode } from "./deps";
export type { PlayerConfig, QueueItem } from "./types";
