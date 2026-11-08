/**
 * @speakkit/engine: text-to-speech engines behind one interface.
 * Does: Kokoro (in a child process or worker thread), a deterministic fake,
 * the shared model lifecycle (lazy load, idle unload, crash-loop guard), text normalization and WAV helpers.
 * Does not: serve HTTP, play audio or know about the wire protocol beyond the types in @speakkit/protocol.
 */
export { EngineNotReadyError, StatusEmitter, type EngineStatus, type SynthOptions, type Synthesized, type TtsEngine } from "./types";
export { LifecycleEngine, DEFAULT_IDLE_MS, type LifecycleOptions } from "./lifecycle";
export { FakeEngine, type FakeEngineOptions } from "./fake";
export { KokoroEngine, type KokoroOptions } from "./kokoro";
export { KOKORO_VOICES } from "./voices";
export { splitLong } from "./split";
export { parseWav, wavHeader, type Wav } from "./wav";
export { normalizeText } from "./text/normalize";
