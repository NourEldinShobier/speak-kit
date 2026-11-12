/**
 * Meeting recording: call detection, the offer and its policy per app, the two tracks (You and Them), echo suppression, retention, notes, search and the
 * finished-event log. Everything that touches a disk, the engine, the network or the clock comes in through `createMeetings(deps)`.
 */
export {
  BROWSERS,
  BUILT_IN_PROVIDERS,
  LINK_MESSAGES,
  allProviders,
  exeMatches,
  parseLink,
  userProvider,
  windowMatches,
  type Link,
  type LinkProblem,
  type NewApp,
  type UserProvider,
} from "./providers";
export { CallTracker, type CallEvent, type TrackerOptions } from "./detect";
export { DEFAULT_POLICY, END_COUNTDOWN_SECONDS, Offers, endPlan, policyFor, type Dismiss, type EndPlan, type OfferAction, type OfferOptions, type Policies } from "./offer";
export { CREDIT_LINES, GATE_DEFAULTS, MicGuard, cleanOutput, energyHasSpeech, frameLevels, hasSpeech, isCredit, repeatsHints, type MicState } from "./silence";
export { correlation, echoWindows, suppressEcho, type EchoOptions, type Window } from "./echo";
export { MIC_BACKOFF_MS, MicPicker, ROUTE_CHECK_MS, RouteWatcher, chooseOutput, rankOutputs, type MicChoice, type MicInputs, type MicSetting, type Output, type OutputChoice } from "./routing";
export { LoopbackSupervisor, TrackWriter, type TrackFiles, type TrackName } from "./tracks";
export { BUNDLE_VERSION, MeetingStore, readEntry, type Line, type MeetingEntry, type MeetingStatus, type NoteVersion, type NotesState, type Who } from "./store";
export { DEFAULT_RETENTION, audioDeadline, audioLabel, readRetention, sweep, textDeadline, type Retention } from "./retention";
export {
  NOTES_FAILURES,
  applyVocabulary,
  chapterText,
  parseNotes,
  promptText,
  stamp,
  vocabularyVersion,
  writeNotes,
  type CompleteResult,
  type Notes,
  type NotesDeps,
  type NotesOutcome,
  type VocabEntry,
} from "./notes";
export { CopyCursor, linesText } from "./cursor";
export { MeetingSearch } from "./search";
export { highlightRanges } from "./highlight";
export { EventLog, type FinishedEvent, type Since } from "./events";
export { createMeetings, temporaryTitle, type Detail, type Meetings, type MeetingsDeps, type Outcome, type Row } from "./meetings";
export type { CallPolicy, CallSession, Failure, MicUser, OpenWindow, Probe, Provider } from "./types";
