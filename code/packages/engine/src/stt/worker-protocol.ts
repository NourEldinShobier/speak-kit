export interface SttWorkerInit {
  engine: "whisper" | "parakeet";
  modelPath: string;
  vadPath: string;
  /** Try the GPU first (the Vulkan addon); the worker falls back to the CPU when it cannot start. */
  gpu: boolean;
  threads: number;
}

export type SttToWorker = { type: "transcribe"; id: number; pcm: Int16Array; language: string };

export type SttFromWorker =
  | { type: "status"; state: "loading" }
  | { type: "status"; state: "ready"; backend: "gpu" | "cpu" }
  | { type: "fatal"; message: string }
  | { type: "result"; id: number; text: string; speech: boolean }
  | { type: "error"; id: number; message: string };
