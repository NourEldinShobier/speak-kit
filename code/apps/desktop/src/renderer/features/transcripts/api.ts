import type { TranscriptsBridge } from "../../../shared/transcripts/contract";

declare global {
  interface Window {
    speakkitTranscripts: TranscriptsBridge;
  }
}

/** The preload's transcripts bridge (window.speakkitTranscripts). */
export const transcripts: TranscriptsBridge = window.speakkitTranscripts;
