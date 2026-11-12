/** What a browser page can use: types and the functions that need no disk. The desktop renderer imports this entry only. */
export { highlightRanges } from "./highlight";
export { linesText } from "./cursor";
export { stamp } from "./notes";
export type { Detail, Outcome, Row } from "./api";
export type { Line, MeetingEntry, MeetingStatus, NoteVersion, NotesState, Who } from "./store";
export type { Since, FinishedEvent } from "./events";
export type { Failure } from "./types";
export { LINK_MESSAGES, parseLink, type LinkProblem } from "./providers";
export { rankOutputs, type Output } from "./routing";
