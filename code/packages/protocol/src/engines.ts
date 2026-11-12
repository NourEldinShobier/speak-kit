import type { EngineState } from "./api";

export type EngineId = "kokoro";

export interface EngineInfo {
  id: EngineId;
  name: string;
  state: EngineState;
  /** 0..1 while downloading. */
  progress?: number;
  detail?: string;
}
export interface EngineList {
  active: EngineId;
  engines: EngineInfo[];
}

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
  /** Where each rendered sentence sits in the file: start and end of its speech in milliseconds (the silence after it is not counted). Grows as sentences finish. */
  sentenceMs?: [number, number][];
  error?: string;
}
