/**
 * Meetings in the app window: the Meetings tab of History, one meeting with its notes and transcript, Settings > Meetings, and the Call recording card of
 * Voice and playback. The two other pages (the hidden recorder and the capsule) have their own entry files next to these.
 */
export { MeetingsTab } from "./MeetingsTab";
export { MeetingView } from "./MeetingView";
export { MeetingsPage } from "./MeetingsPage";
export { CallRecordingCard } from "./CallRecordingCard";
export { usePush as useMeetingsPush, useSettingsView as useMeetingsSettings } from "./useMeetings";
export { requestOpen, takeOpen } from "./open";
