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

/** Token saving defaults of every voice session: short answers, and the oldest turns dropped (20 percent at a time, so the cached prefix survives between drops) once the turns after the instructions pass the limit. */
export const VOICE_CHAT_LIMITS = {
  maxOutputTokens: 400,
  retentionRatio: 0.8,
  postInstructionTokens: 6000,
} as const;

/** The session fields of those limits, as the Realtime API names them (a client secret and a session.update take the same). */
export const voiceChatSessionLimits = () => ({
  max_output_tokens: VOICE_CHAT_LIMITS.maxOutputTokens,
  truncation: { type: "retention_ratio", retention_ratio: VOICE_CHAT_LIMITS.retentionRatio, token_limits: { post_instructions: VOICE_CHAT_LIMITS.postInstructionTokens } },
});

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

const parser =
  <T>(schema: v.GenericSchema<unknown, T>) =>
  (x: unknown): T | undefined => {
    const r = v.safeParse(schema, x);
    return r.success ? r.output : undefined;
  };
/** Returns the parsed answer of GET /v1/voice-chat/status, or undefined when it does not match. */
export const parseVoiceChatStatus = parser(voiceChatStatusSchema);
/** Returns the parsed answer of POST /v1/voice-chat/session, or undefined when it does not match. */
export const parseVoiceChatSession = parser(voiceChatSessionSchema);
/** Returns the code of an error body on any HTTP status: `{ code }` alone or the full VoiceChatError. Anything else is undefined. */
export const parseVoiceChatError = parser(
  v.pipe(
    v.object({ code: errorCode }),
    v.transform((b) => b.code),
  ),
);
