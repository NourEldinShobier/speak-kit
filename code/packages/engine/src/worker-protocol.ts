export interface WorkerInit {
  modelsDir: string;
  modelId: string;
  dtype: "fp32" | "fp16" | "q8" | "uint8" | "q4" | "q4f16";
  device: "cpu" | "dml";
  threads: number;
  warmup: boolean;
  warmupVoice: string;
}

export type ToWorker = { type: "synth"; id: number; text: string; voice: string; speed: number } | { type: "cancel"; id: number };

export type FromWorker =
  | {
      type: "status";
      state: "downloading" | "loading" | "ready";
      progress?: number;
      detail?: string;
    }
  | { type: "fatal"; message: string }
  | { type: "result"; id: number; cancelled?: boolean; pcm?: Int16Array; sampleRate?: number }
  | { type: "error"; id: number; message: string };
