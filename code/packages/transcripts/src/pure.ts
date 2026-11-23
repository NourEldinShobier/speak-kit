/** What a browser page can use: no file system, no hashing. The desktop renderer imports this entry only. */
export { clock } from "./text";
export { TEXT_DAYS } from "./retention";
export { findMatches, tokenize, type Match } from "./search";
export { AUDIO_FORMATS, FORMAT_LIST, MAX_HOURS } from "./formats";
export { RATE } from "./chunker";
export type { Detail, Outcome, Row } from "./api";
export type { Failure, FailureCode, Segment, Status } from "./types";
export { type NoteDoc, type NotesState, type NotesView } from "./notes";
