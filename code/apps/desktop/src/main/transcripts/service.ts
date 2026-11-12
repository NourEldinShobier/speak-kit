import path from "node:path";
import { createTranscripts, nodeFs, type Fs, type Outcome, type Transcripts } from "@speakkit/transcripts";
import type { Push } from "../../shared/transcripts/contract";
import { recordToggle } from "../../shared/tray";
import { policyOf } from "../../shared/transcripts/settings";
import type { Ctx } from "../context";
import type { FilePorts } from "./decode";
import { createHandlers, type Handlers } from "./handlers";
import { Live } from "./live";
import { chunkEngine } from "./engine";
import { RecordingSession, type MicPort } from "./mic-session";
import type { Stt } from "../dictation/stt";
import type { DictationModelId } from "../../shared/dictation/settings";

/** What the service needs from Electron and the rest of the app, so tests can stand in for each. */
export interface TranscriptsPorts {
  dataDir: string;
  /** Documents folder: the default home of exports is `Speak Kit/Transcripts` inside it. */
  documentsDir: string;
  fs?: Fs;
  stt: Stt;
  model(): DictationModelId;
  modelName(): { name: string; installed: boolean };
  /** Dictation is recording or transcribing. */
  dictationBusy(): boolean;
  files: Omit<FilePorts, "decodeInPage"> & { decodeInPage: FilePorts["decodeInPage"] };
  mic: MicPort;
  dialog: { pickFile(): Promise<string | null>; pickFolder(): Promise<string | null> };
  /** `trash` moves a file to the Recycle Bin (Windows) or the Trash (macOS) and rejects when it cannot. */
  shell: { reveal(file: string): void; trash(file: string): Promise<void>; openFolder(dir: string): Promise<void> };
  clipboard: { writeText(text: string): void };
  /** Tells the windows to redraw. */
  push(p: Push): void;
  /** The tray follows the recorder and the jobs. */
  changed(): void;
  /** How long the tray says "Done" after a transcript finishes. */
  doneMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
}

export type TrayPhase = "ready" | "starting" | "recording" | "saving" | "transcribing" | "done";

export interface TranscriptsService {
  handlers: Handlers;
  core: Promise<Transcripts>;
  /** What the tray item shows. */
  phase(): TrayPhase;
  stopRecording(): Promise<Outcome<{ id: string }>>;
  startRecording(): Promise<Outcome<{ id: string }>>;
  /** The global record shortcut: stops a running recording, starts one when idle. */
  toggleRecording(): Promise<unknown>;
  dispose(): Promise<void>;
}

const HOUR = 3_600_000;

/** The store and the recorder of transcripts, wired to the engine, the OS ports and the window. */
export function createTranscriptsService(ctx: Ctx, p: TranscriptsPorts): TranscriptsService {
  const cfg = () => ctx.config.transcripts;
  const folder = () => cfg().folder || path.join(p.documentsDir, "Speak Kit", "Transcripts");
  const live = new Live(p.push, p.changed, p.doneMs);
  const core = createTranscripts({
    dir: `${p.dataDir}/transcripts`,
    fs: p.fs ?? nodeFs(),
    now: p.now ?? Date.now,
    newId: p.newId ?? (() => crypto.randomUUID()),
    transcribe: chunkEngine({ stt: p.stt, model: p.model }),
    busy: p.dictationBusy,
    sleep: p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    model: p.model,
    policy: () => policyOf(cfg()),
    exportDir: folder,
    changed: () => live.changed(),
    recycle: (f) => p.shell.trash(f),
    warn: (text) => {
      live.notice = text;
      live.send();
    },
  });
  const ready = core.then((t) => t.ready.then(() => (live.facade = t)));
  const session = core.then((t) => recorderOf({ ctx, ports: p, transcripts: t, live }));
  const sweepTimer = setInterval(() => void core.then((t) => t.sweep()), HOUR);
  sweepTimer.unref();
  const handlers = createHandlers({ ready, session, ports: p, cfg, folder, saveConfig: () => ctx.saveConfig(), live: () => live.snapshot(), clearNotice: () => void (live.notice = undefined) });
  return {
    handlers,
    core: ready,
    phase: () => livePhase(live),
    startRecording: handlers.recordStart,
    stopRecording: handlers.recordStop,
    toggleRecording: async () => {
      const a = recordToggle(livePhase(live));
      if (a === "stop") return handlers.recordStop();
      if (a === "none") return undefined;
      const r = await handlers.recordStart();
      ctx.showWindow();
      return r;
    },
    async dispose() {
      clearInterval(sweepTimer);
      const t = await ready;
      if (live.recording?.phase === "recording") await (await session).stop();
      await t.dispose();
    },
  };
}

function livePhase(live: Live): TrayPhase {
  const r = live.recording;
  if (r) return r.phase === "starting" || r.phase === "saving" ? r.phase : "recording";
  if (live.busy) return "transcribing";
  return Date.now() < live.doneUntil ? "done" : "ready";
}

/** The manual recorder over the store: its changes go to the window, and a recording that ends by itself leaves a notice and a bell entry. */
function recorderOf({ ctx, ports: p, transcripts: t, live }: { ctx: Ctx; ports: TranscriptsPorts; transcripts: Transcripts; live: Live }): RecordingSession {
  return new RecordingSession({
    mic: p.mic,
    transcripts: t,
    language: () => ctx.config.transcripts.language,
    now: p.now ?? Date.now,
    changed: (v) => live.setRecording(v),
    notice: (text) => {
      live.notice = text;
      ctx.addActivity("error", "Recording stopped", text);
      ctx.publish();
      live.send();
    },
  });
}
