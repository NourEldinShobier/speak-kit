/**
 * Wire contract of Speak Kit: HTTP API types, streaming frame codec, extension messages, settings, engine types and response schemas.
 * Shared by the extension, the desktop app and the server; imports no workspace package.
 * Does not contain behaviour beyond encoding, decoding, validating and formatting; transport and storage live in the consumers.
 * The exported names are pinned by src/surface.test.ts; a wire change needs an API_VERSION decision first.
 */
export { API_VERSION, APP_ID, DEFAULT_PORT, DEFAULT_VOICE, FRAMES_CONTENT_TYPE, LOOPBACK_HOST, MAX_SPEED, MIN_SPEED, SAMPLE_RATE } from "./constants";
export { ERROR_CODES } from "./api";
export type { EngineState, ErrorCode, Health, HoldRequest, SpeakRequest, Voice, VoiceList } from "./api";
export { FrameDecoder, encodeFrame, floatToInt16 } from "./frames";
export type { Frame, FrameHeader } from "./frames";
export type { BgToContent, ContentToBg, ExtractReply, HelloReply, PlayerCommand, PlayerState, PlayerStatus, ReadDoc, ReadSentence, SentenceStart } from "./messages";
export { DEFAULT_SENTENCE_COLOR, DEFAULT_WORD_COLOR, SETTINGS_KEY, TOKEN_KEY, defaultSettings } from "./settings";
export type { Settings, SiteDefault, SiteRule } from "./settings";
export type { EngineId, EngineInfo, EngineList, ExportJob, ExportRequest, ExportState } from "./engines";
export { engineListSchema, errorBodySchema, exportJobSchema, healthSchema, parseHealth, parseVoiceList, voiceListSchema } from "./schemas";
export { VOICE_PORT } from "./voice-chat";
export type { VoiceDown, VoicePage, VoicePhase, VoiceProblem, VoiceUp, VoiceUsage, VoiceView } from "./voice-chat";
export { clock, compareNames, plural } from "./format";
export * from "./voice-chat-app";
export * from "./screen-look";
