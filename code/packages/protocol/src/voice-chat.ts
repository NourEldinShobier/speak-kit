import type { VoiceChatErrorCode } from "./voice-chat-app";

/**
 * Voice chat inside the extension: the messages between the page, the worker and the voice document.
 * The wire contract with the app (key status, client secrets, error codes) is in voice-chat-app.ts.
 */

/** The page a conversation is about. `text` is paragraphs separated by a blank line; `selection` is what the user had selected. */
export interface VoicePage {
  url: string;
  title: string;
  text: string;
  selection?: string | undefined;
}

/** What the voice pill shows when it is not an error. */
export type VoicePhase = "connecting" | "idle" | "listening" | "thinking" | "speaking" | "reconnecting" | "idle-warning" | "cost-warning" | "ended";
/** One pill per way a conversation can fail. `unreadable`, `too-long` and `page-changed` come from the page, `app-not-running` and `unpaired` from the local app, the rest from the connection. */
export type VoiceProblem = VoiceChatErrorCode | "app-not-running" | "unpaired" | "mic-blocked" | "mic-missing" | "unreadable" | "too-long" | "page-changed";

/** The per-session usage line of the ended pill: estimated cost from the model's usage reports, length of the conversation, and whether the cost cap ended it. */
export interface VoiceUsage {
  costUsd: number;
  /** filled in by the page, which times the conversation */
  seconds?: number;
  capped?: boolean;
}

export interface VoiceView {
  phase: VoicePhase;
  muted: boolean;
  /** reconnect attempt, 1 to 5 (phase "reconnecting") */
  attempt?: number;
  /** seconds left of the idle warning */
  secondsLeft?: number;
  /** what the conversation cost, set once it ended without a problem */
  usage?: VoiceUsage | undefined;
  /** an error or notice pill replaces the grid; the conversation is over unless the problem is `page-changed` */
  problem?: VoiceProblem;
}

/** page -> worker, over the port named VOICE_PORT. */
export type VoiceUp = { t: "start"; page: VoicePage } | { t: "update"; page: VoicePage } | { t: "mute"; on: boolean } | { t: "keep-going" } | { t: "end" };
/** worker -> page. `level` is 0 to 1: the microphone while listening, the model's voice while speaking. */
export type VoiceDown = { t: "view"; view: VoiceView } | { t: "level"; v: number };

export const VOICE_PORT = "speakkit-voice";
