import { IdleRelease, LocalWriter, type IdleMinutes, type Transfers } from "@speakkit/engine";
import type { LocalWriterPort } from "../dictation/local-rewriter";
import { WriterModels } from "./writer";

interface Args {
  modelsDir: string;
  writerWorker: URL;
  /** Whether the graphics card may run it: the same device choice as the speech models. */
  gpu(): boolean;
  /** Minutes of quiet before the model is released; 0 is never. The same choice as the speech models. */
  idleMinutes(): IdleMinutes;
  /** A recording runs: the model is kept. */
  recording(): boolean;
  fetch: typeof fetch | undefined;
  transfers: Transfers;
  scanDirs(): string[];
  changed(): void;
}

/** The rewrite pass's writer: the engine that runs the model, the port the rewriter talks to, the file on disk, and the release after a quiet spell. */
export interface WriterParts {
  engine: LocalWriter;
  port: LocalWriterPort;
  files: WriterModels;
  dispose(): Promise<void>;
}

export function createWriterParts(a: Args): WriterParts {
  const engine = new LocalWriter({ modelsDir: a.modelsDir, workerUrl: a.writerWorker, gpu: a.gpu, ...(a.fetch && { fetch: a.fetch }) });
  const idle = new IdleRelease({
    minutes: a.idleMinutes,
    busy: () => engine.busy || a.recording(),
    release: () => engine.unload(),
  });
  engine.onStatus((s) => (s.state === "ready" ? idle.touch() : idle.stop()));
  const port: LocalWriterPort = {
    downloaded: () => engine.downloaded(),
    complete: async (req) => {
      try {
        return await engine.complete(req);
      } finally {
        idle.touch();
      }
    },
  };
  const files = new WriterModels({ modelsDir: a.modelsDir, writer: engine, transfers: a.transfers, scanDirs: a.scanDirs, changed: a.changed });
  return {
    engine,
    port,
    files,
    dispose: async () => {
      idle.stop();
      await engine.unload();
    },
  };
}
