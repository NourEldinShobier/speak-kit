/**
 * Wire contract of Speak Kit: HTTP API types, streaming frame codec, extension messages, settings, engine types and response schemas.
 * Shared by the extension, the desktop app and the server; imports no workspace package.
 * Does not contain behaviour beyond encoding, decoding, validating and formatting; transport and storage live in the consumers.
 * Area: packages/protocol. The exported names are pinned by src/surface.test.ts; a wire change needs an API_VERSION decision first.
 */
export { API_VERSION, APP_ID, DEFAULT_PORT, DEFAULT_VOICE, FRAMES_CONTENT_TYPE, LOOPBACK_HOST, MAX_SPEED, MIN_SPEED, SAMPLE_RATE } from "./constants";
export { ERROR_CODES } from "./api";
export type { EngineState, ErrorCode, Health, HoldRequest, SpeakRequest, Voice, VoiceList } from "./api";
export { FrameDecoder, encodeFrame, floatToInt16 } from "./frames";
export type { Frame, FrameHeader } from "./frames";
export type { BgToContent, ContentToBg, ExtractReply, HelloReply, PlayerCommand, PlayerState, PlayerStatus, ReadDoc, ReadSentence, SentenceStart } from "./messages";
export { DEFAULT_SENTENCE_COLOR, DEFAULT_WORD_COLOR, SETTINGS_KEY, TOKEN_KEY, defaultSettings } from "./settings";
export type { Settings, SiteDefault, SiteRule } from "./settings";
export { CLONE_MAX_MS, CLONE_MIN_MS, CLONE_MIN_RATE } from "./engines";
export type { CloneCheck, CloneCheckId, CloneVoiceRequest, ClonedVoice, EngineId, EngineInfo, EngineList, EngineReason, ExportJob, ExportRequest, ExportState, SelectEngineRequest, UpdateVoiceRequest } from "./engines";
export { clonedVoiceListSchema, clonedVoiceSchema, engineListSchema, errorBodySchema, exportJobSchema, healthSchema, parseHealth, parseVoiceList, voiceListSchema } from "./schemas";
export { clock, compareNames, plural } from "./format";
