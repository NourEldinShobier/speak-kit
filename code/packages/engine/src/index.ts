/**
 * @speakkit/engine: text-to-speech engines behind one interface.
 * Does: Kokoro (in a child process or worker thread), Chatterbox (Python sidecar, voice cloning), a deterministic fake,
 * the shared model lifecycle (lazy load, idle unload, crash-loop guard), text normalization and WAV helpers.
 * Does not: serve HTTP, play audio or know about the wire protocol beyond the types in @speakkit/protocol.
 * Area: engines.
 */
export { EngineNotReadyError, EngineUnavailableError, StatusEmitter, type EngineStatus, type SynthOptions, type Synthesized, type TtsEngine } from "./types";
export { LifecycleEngine, DEFAULT_IDLE_MS, type LifecycleOptions } from "./lifecycle";
export { FakeEngine, type FakeEngineOptions } from "./fake";
export { KokoroEngine, type KokoroOptions } from "./kokoro";
export { KOKORO_VOICES } from "./voices";
export { splitLong } from "./split";
export { ChatterboxEngine, type ChatterboxOptions, type InstallContext } from "./chatterbox/engine";
export { detectHardware, MIN_VRAM_MB, type Hardware } from "./chatterbox/detect";
export { ClonedVoiceStore } from "./chatterbox/voice-store";
export { analyzeClip, type ClipReport } from "./chatterbox/clip";
export { parseWav, encodeWav, wavHeader, WavError, type Wav } from "./chatterbox/wav";
export { normalizeText, type NormalizeOptions } from "./text/normalize";
