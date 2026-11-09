import * as v from "valibot";

/**
 * Voice chat key handling: the long-lived OpenAI API key stays in the desktop app; the extension only gets short-lived Realtime client secrets.
 *
 *   GET  /v1/voice-chat/status   -> 200 VoiceChatStatus
 *   POST /v1/voice-chat/session  -> 200 VoiceChatSession | VoiceChatError (no request body; at most 10 per minute, then 429 "rate-limited")
 *
 * Error HTTP status per code: no-key 409, key-rejected 424, no-credit 402, rate-limited 429, offline 503, unavailable 502 (503 when the app has no voice chat service).
 */
export const VOICE_CHAT_MODEL = "gpt-realtime-2.1";
/** Built-in voices of the Realtime API (GA). */
export const VOICE_CHAT_VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"] as const;
export type VoiceChatVoice = (typeof VOICE_CHAT_VOICES)[number];
export const DEFAULT_VOICE_CHAT_VOICE: VoiceChatVoice = "marin";

export const VOICE_CHAT_ERROR_CODES = ["no-key", "key-rejected", "no-credit", "rate-limited", "offline", "unavailable"] as const;
export type VoiceChatErrorCode = (typeof VOICE_CHAT_ERROR_CODES)[number];

export interface VoiceChatStatus {
  hasKey: boolean;
}

export interface VoiceChatSession {
  /** Ephemeral Realtime client secret ("ek_..."). Not the API key. */
  clientSecret: string;
  /** Unix seconds. */
  expiresAt: number;
  model: typeof VOICE_CHAT_MODEL;
  voice: VoiceChatVoice;
}

/** `code` is repeated inside `error` so the generic `{ error: { code, message } }` parser also reads it. */
export interface VoiceChatError {
  code: VoiceChatErrorCode;
  error: { code: VoiceChatErrorCode; message: string };
}

const errorCode = v.picklist(VOICE_CHAT_ERROR_CODES);

export const voiceChatStatusSchema: v.GenericSchema<unknown, VoiceChatStatus> = v.object({ hasKey: v.boolean() });

export const voiceChatSessionSchema: v.GenericSchema<unknown, VoiceChatSession> = v.object({
  clientSecret: v.pipe(v.string(), v.minLength(1)),
  expiresAt: v.number(),
  model: v.literal(VOICE_CHAT_MODEL),
  voice: v.picklist(VOICE_CHAT_VOICES),
});

export const voiceChatErrorSchema: v.GenericSchema<unknown, VoiceChatError> = v.object({
  code: errorCode,
  error: v.object({ code: errorCode, message: v.string() }),
});
