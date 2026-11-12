import type { SettingsView, TranscriptsBridge } from "../../../shared/transcripts/contract";
import type { TranscriptsPatch } from "../../../shared/transcripts/settings";
import { patchViaRegistry } from "../../registry-patch";

declare global {
  interface Window {
    speakkitTranscripts: TranscriptsBridge;
  }
}

/** The answer of a call, or null when the call itself failed (the window was closing, the main process is gone): the page shows its own failure text then. */
export const attempt = <T>(call: Promise<T>): Promise<T | null> =>
  call.then(
    (v) => v,
    () => null,
  );

/** The preload's transcripts bridge (window.speakkitTranscripts). */
export const transcripts: TranscriptsBridge = window.speakkitTranscripts;

/** Changes transcript settings through the settings registry and returns the settings as they are now. */
export const patchTranscripts = (patch: TranscriptsPatch): Promise<SettingsView> => patchViaRegistry("transcripts", patch, { status: () => transcripts.settings() });
