export interface WriterWorkerInit {
  modelPath: string;
  /** Try the graphics card first; the worker falls back to the CPU when it cannot start. */
  gpu: boolean;
  threads: number;
}

export type WriterToWorker =
  | { type: "rewrite"; id: number; system: string; text: string }
  /** Stops that job: at once when it is running, before it starts when it still waits. Its answer is not sent. */
  | { type: "abort"; id: number };

export type WriterFromWorker =
  | { type: "status"; state: "loading" }
  | { type: "status"; state: "ready"; backend: "gpu" | "cpu"; gpuFallback?: string; loadMs: number }
  | { type: "fatal"; message: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string };
