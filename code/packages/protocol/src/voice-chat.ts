/**
 * Voice chat: the Speak Kit app holds the user's OpenAI key and mints short-lived Realtime client secrets for the extension.
 * The extension connects to OpenAI over WebRTC with the secret only. Also the messages between the page, the worker and the voice document.
 *
 *   GET  /v1/voice-chat/status   -> VoiceChatStatus
 *   POST /v1/voice-chat/session  -> body {}; 200 VoiceChatSession, or an error body { code: VoiceChatError } (any HTTP status >= 400)
 */
export const VOICE_CHAT_MODEL = "gpt-realtime-2.1" as const;
export const VOICE_CHAT_ERRORS = ["no-key", "key-rejected", "no-credit", "rate-limited", "offline", "unavailable"] as const;
export type VoiceChatError = (typeof VOICE_CHAT_ERRORS)[number];

export interface VoiceChatStatus {
  hasKey: boolean;
}
export interface VoiceChatSession {
  clientSecret: string;
  /** unix seconds */
  expiresAt: number;
  model: typeof VOICE_CHAT_MODEL;
  voice: string;
}

/** The page a conversation is about. `text` is paragraphs separated by a blank line; `selection` is what the user had selected. */
export interface VoicePage {
  url: string;
  title: string;
  text: string;
  selection?: string | undefined;
}

/** What the voice pill shows when it is not an error. */
export type VoicePhase = "connecting" | "idle" | "listening" | "thinking" | "speaking" | "reconnecting" | "idle-warning" | "ended";
/** One pill per way a conversation can fail. `unreadable`, `too-long` and `page-changed` come from the page, `app-not-running` and `unpaired` from the local app, the rest from the connection. */
export type VoiceProblem = VoiceChatError | "app-not-running" | "unpaired" | "mic-blocked" | "unreadable" | "too-long" | "page-changed";

export interface VoiceView {
  phase: VoicePhase;
  muted: boolean;
  /** reconnect attempt, 1 to 5 (phase "reconnecting") */
  attempt?: number;
  /** seconds left of the idle warning */
  secondsLeft?: number;
  /** an error or notice pill replaces the grid; the conversation is over unless the problem is `page-changed` */
  problem?: VoiceProblem;
}

/** page -> worker, over the port named VOICE_PORT. */
export type VoiceUp = { t: "start"; page: VoicePage } | { t: "update"; page: VoicePage } | { t: "mute"; on: boolean } | { t: "keep-going" } | { t: "end" };
/** worker -> page. `level` is 0 to 1: the microphone while listening, the model's voice while speaking. */
export type VoiceDown = { t: "view"; view: VoiceView } | { t: "level"; v: number };

export const VOICE_PORT = "speakkit-voice";
