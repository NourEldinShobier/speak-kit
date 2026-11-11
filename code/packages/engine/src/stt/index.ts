/**
 * Speech to text for dictation: whisper.cpp through @fugood/whisper.node in a child process.
 * Does: model catalog, resumable checksummed download, Silero voice gate before every transcription, GPU with CPU fallback, background warm-up.
 * Does not: record audio, decide when to record, or insert text anywhere.
 */
export { WhisperStt, type SpeechToText, type SttOptions, type Transcript } from "./engine";
export { DEFAULT_STT_MODEL, STT_MODELS, type SttLanguage, type SttModel, type SttModelId } from "./catalog";
