import type { EngineState } from "./api";

export type EngineId = "kokoro" | "chatterbox";

/** Why an optional engine cannot be used right now. `out-of-memory`: the GPU ran out of memory (state `unloaded`, the next request retries); `disk-full`: an install needs more free disk space (state `missing`). */
export type EngineReason = "no-gpu" | "python-missing" | "not-installed" | "out-of-memory" | "disk-full";

export interface EngineInfo {
  id: EngineId;
  name: string;
  state: EngineState;
  /** 0..1 while installing or downloading. */
  progress?: number;
  detail?: string;
  reason?: EngineReason;
  /** Optional engines can be installed and removed from the desktop app. */
  optional: boolean;
  /** Whether the engine can clone voices from a reference clip. */
  cloning: boolean;
  /** Detected hardware, for the "fit checks" on the engines screen. */
  gpu?: { name: string; vramMb: number };
}
export interface EngineList {
  active: EngineId;
  engines: EngineInfo[];
}
export interface SelectEngineRequest {
  id: EngineId;
}

/** Body of POST /v1/voices/clone. `audio` is a base64 WAV file (PCM 16/24/32-bit or float32, mono or stereo). */
export interface CloneVoiceRequest {
  name: string;
  /** The speaker agreed to be cloned. Must be true. */
  consent: boolean;
  gender?: "female" | "male";
  audio: string;
}
export type CloneCheckId = "length" | "sample-rate" | "loudness" | "silence" | "noise";
export interface CloneCheck {
  id: CloneCheckId;
  ok: boolean;
  message: string;
}
export interface ClonedVoice {
  id: string;
  name: string;
  durationMs: number;
  createdAt: number;
  checks: CloneCheck[];
  /** Voice style, 0 to 1 (calm to dramatic). Absent until set; the engine then uses its neutral 0.5. */
  exaggeration?: number;
  /** Voice style, 0 to 1 (slow to fast). Absent until set; the engine then uses its neutral 0.5. */
  pace?: number;
}
/** Body of PATCH /v1/voices/<id> (cloned voices only): at least one field. Answers 200 ClonedVoice. */
export interface UpdateVoiceRequest {
  name?: string;
  exaggeration?: number;
  pace?: number;
}
export const CLONE_MIN_MS = 5_000;
export const CLONE_MAX_MS = 30_000;
export const CLONE_MIN_RATE = 16_000;

/** Body of POST /v1/export. Same limits as SpeakRequest; `gapMs` of silence goes between sentences. */
export interface ExportRequest {
  sentences: string[];
  voice: string;
  speed: number;
  gapMs?: number;
}
export type ExportState = "running" | "done" | "cancelled" | "error";
export interface ExportJob {
  id: string;
  state: ExportState;
  /** Sentences rendered so far and in total. */
  done: number;
  total: number;
  durationMs: number;
  error?: string;
}
