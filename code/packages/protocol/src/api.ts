import type { EngineId } from "./engines";

/**
 * HTTP API served by the desktop app on http://127.0.0.1:<port>/v1.
 * Auth: `Authorization: Bearer <token>` on everything except GET /v1/health.
 * Requests whose Origin is an http(s) web page are rejected (CSRF / DNS rebinding); only no-Origin or chrome-extension:// origins pass.
 *
 *   GET  /v1/health        -> Health            (no auth)
 *   GET  /v1/auth/check    -> 204 | 401         (token check, used by the pairing UI)
 *   GET  /v1/voices        -> VoiceList
 *   POST /v1/speak         -> body SpeakRequest, response is a stream of frames (see frames.ts)
 *   POST /v1/engine/warm   -> 202, loads the model ahead of the first request (idempotent)
 *   POST /v1/engine/hold   -> body HoldRequest, 204; keeps a ready model loaded for at least `ms` more (0 clears). Sent while paused.
 *   GET  /v1/engines                -> EngineList
 *   POST /v1/engines/select         -> body SelectEngineRequest, 200 EngineList (409 engine-unavailable when it cannot run here)
 *   POST /v1/engines/<id>/install   -> 202 EngineList; progress is the engine's state ("installing", then "downloading")
 *   DELETE /v1/engines/<id>         -> 200 EngineList; removes an installed optional engine
 *   POST /v1/voices/clone           -> body CloneVoiceRequest, 201 ClonedVoice (422 clip-rejected with `checks`)
 *   DELETE /v1/voices/<id>          -> 204 (cloned voices only)
 *   POST /v1/export                 -> body ExportRequest, 202 ExportJob; render sentences to one WAV
 *   GET  /v1/export/<id>            -> ExportJob (progress); GET /v1/export/<id>/audio streams the WAV; DELETE /v1/export/<id> cancels and removes it
 *
 * /v1/speak accepts the header `X-SpeakKit-Replace: <id>`: earlier streams (running or queued) that were sent with the same id are cancelled first,
 * so each tab can pass its own id. The legacy value `1` cancels every earlier stream of the token.
 * More than the server's concurrent-stream limit queue FIFO; beyond the queue limit the response is HTTP 429 with code "busy".
 */
/**
 * `installing`: an optional engine is being set up (Python environment); `downloading`: weights are being fetched.
 * `unavailable`: cannot run on this machine (see EngineInfo.reason); `missing` on an optional engine means installable.
 * `unloaded`: model files are present but nothing is in RAM; the next /v1/speak (or POST /v1/engine/warm) loads it. Not an error. */
export type EngineState = "missing" | "downloading" | "installing" | "unavailable" | "unloaded" | "loading" | "ready" | "error";

export interface Health {
  app: "speakkit";
  version: string;
  apiVersion: 1;
  engine: { id: EngineId; state: EngineState; progress?: number; detail?: string; /** epoch ms when an idle model will be unloaded, while state is ready */ idleUnloadAtMs?: number };
}

export interface Voice {
  id: string; // kokoro id, e.g. "af_heart"
  name: string; // "Heart"
  lang: "en-US" | "en-GB";
  gender: "female" | "male";
  quality: "A" | "B" | "C" | "D";
  traits?: string;
  /** Present on voices the user cloned from a reference clip (Chatterbox). */
  cloned?: true;
}
export interface VoiceList { voices: Voice[]; default: string }

export interface SpeakRequest {
  /** Sentences to read, in order. Each becomes one audio frame. */
  sentences: string[];
  voice: string;
  /** 0.5 to 3. The server applies min(speed, 2) in the model; the player applies the remainder as playbackRate. */
  speed: number;
}

/** Body of POST /v1/engine/hold. 0 to 3 600 000. The extension sends 600000 on pause and 0 on resume. */
export interface HoldRequest { ms: number }

const ERROR_CODES = [
  "app-not-running",
  "token-rejected",
  "engine-not-ready",
  "page-unreadable",
  "file-access",
  "synthesis-failed",
  "version-mismatch",
  "invalid-request",
  "forbidden",
  /** HTTP 429: too many concurrent /v1/speak streams. */
  "busy",
  /** HTTP 409: the engine cannot run here or is not installed. */
  "engine-unavailable",
  /** HTTP 422: the reference clip failed its quality checks, or consent is missing. */
  "clip-rejected",
  "not-found",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
