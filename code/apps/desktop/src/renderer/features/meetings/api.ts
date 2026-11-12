import type { MeetingsBridge, SettingsView } from "../../../shared/meetings/contract";
import type { MeetingsPatch } from "../../../shared/meetings/settings";
import { patchViaRegistry } from "../../registry-patch";

declare global {
  interface Window {
    speakkitMeetings: MeetingsBridge;
  }
}

/** The answer of a call, or null when the call itself failed (the window was closing, the main process is gone): the page shows its own failure text then. */
export const attempt = <T>(call: Promise<T>): Promise<T | null> =>
  call.then(
    (v) => v,
    () => null,
  );

/** The preload's meetings bridge (window.speakkitMeetings). */
export const meetings: MeetingsBridge = window.speakkitMeetings;

/** Changes call recording settings through the settings registry and returns the settings as they are now. */
export const patchMeetings = (patch: MeetingsPatch): Promise<SettingsView> => patchViaRegistry("meetings", patch, { status: () => meetings.settings() });
