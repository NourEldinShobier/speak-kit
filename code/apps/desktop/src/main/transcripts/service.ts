import { createTranscripts, nodeFs, type Fs, type Summarise, type Transcripts } from "@speakkit/transcripts";
import type { Push } from "../../shared/transcripts/contract";
import type { Ctx } from "../context";
import type { FilePorts } from "./decode";
import { createHandlers, type Handlers } from "./handlers";
import { chunkEngine } from "./engine";
import type { Stt } from "../dictation/stt";
import type { DictationModelId } from "../../shared/dictation/settings";

/** What the service needs from Electron and the rest of the app, so tests can stand in for each. */
export interface TranscriptsPorts {
  dataDir: string;
  fs?: Fs;
  stt: Stt;
  model(): DictationModelId;
  modelName(): { name: string; installed: boolean };
  /** Dictation is recording or transcribing. */
  dictationBusy(): boolean;
  /** The notes writer, or nothing when notes are off or there is no key. */
  notes?(): Summarise | undefined;
  files: Omit<FilePorts, "decodeInPage"> & { decodeInPage: FilePorts["decodeInPage"] };
  dialog: { pickFile(): Promise<string | null> };
  /** `trash` moves a file to the Recycle Bin (Windows) or the Trash (macOS) and rejects when it cannot. */
  shell: { trash(file: string): Promise<void> };
  clipboard: { writeText(text: string): void };
  /** Tells the windows to redraw. */
  push(p: Push): void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
}

export interface TranscriptsService {
  handlers: Handlers;
  core: Promise<Transcripts>;
  dispose(): Promise<void>;
}

const HOUR = 3_600_000;

/** The store of transcripts, wired to the engine, the OS ports and the window. */
export function createTranscriptsService(ctx: Ctx, p: TranscriptsPorts): TranscriptsService {
  let tick = 0;
  const core = createTranscripts({
    dir: `${p.dataDir}/transcripts`,
    fs: p.fs ?? nodeFs(),
    now: p.now ?? Date.now,
    newId: p.newId ?? (() => crypto.randomUUID()),
    transcribe: chunkEngine({ stt: p.stt, model: p.model }),
    busy: p.dictationBusy,
    sleep: p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    model: p.model,
    ...(p.notes && { notes: p.notes }),
    changed: () => p.push({ tick: ++tick }),
    recycle: (f) => p.shell.trash(f),
  });
  const ready = core.then((t) => t.ready.then(() => t));
  const sweepTimer = setInterval(() => void core.then((t) => t.sweep()), HOUR);
  sweepTimer.unref();
  const handlers = createHandlers({ ready, ports: p, cfg: () => ctx.config.transcripts, saveConfig: () => ctx.saveConfig(), push: () => ({ tick }) });
  return {
    handlers,
    core: ready,
    async dispose() {
      clearInterval(sweepTimer);
      await (await ready).dispose();
    },
  };
}
