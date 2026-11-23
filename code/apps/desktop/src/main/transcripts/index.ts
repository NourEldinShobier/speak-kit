import type { Summarise } from "@speakkit/transcripts";
import { app, ipcMain, type BrowserWindow } from "electron";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import { TRANSCRIPTS_EVENT, TRANSCRIPTS_METHODS, transcriptsChannel, type TranscriptsMethod } from "../../shared/transcripts/channels";
import { TRANSCRIPTS_ARGS } from "../../shared/transcripts/contract";
import { registerValidatedIpc } from "../ipc-register";
import { dialogs, diskFiles, systemPorts, TestSwitches } from "./electron-ports";
import { createDecoder } from "./hosts";
import { createTranscriptsService, type TranscriptsService } from "./service";

export interface TranscriptsOptions {
  distDir: string;
  parent(): BrowserWindow | null;
  /** The speech engine and model are dictation's: transcripts borrow them. */
  dictation: DictationService;
  /** The notes writer, or nothing when notes are off. */
  notes?(): Summarise | undefined;
  /** The test hook is on: the file chooser is replaced by what the test sets. */
  test: boolean;
}

export interface TranscriptsFeature extends TranscriptsService {
  /** Tests only: the next file chooser answer and what was copied. */
  testHook: { pick(file: string | null): void; clipboard(): string };
}

/** Transcripts in the desktop app: the store, the hidden decoder page, and the IPC the History page calls. */
export function setupTranscripts(ctx: Ctx, o: TranscriptsOptions): TranscriptsFeature {
  const sw = new TestSwitches();
  const decoder = createDecoder({ ipcMain, distDir: o.distDir });
  const service = createTranscriptsService(ctx, {
    dataDir: app.getPath("userData"),
    stt: o.dictation.stt,
    model: () => ctx.config.dictation.model,
    modelName: () => {
      const m = o.dictation.models.views().find((v) => v.selected);
      return { name: m?.name ?? "Speech model", installed: !!m?.installed };
    },
    dictationBusy: () => o.dictation.state.status !== "idle" && o.dictation.state.status !== "error",
    ...(o.notes && { notes: o.notes }),
    files: diskFiles(decoder.decodeInPage),
    dialog: dialogs(o.test, sw),
    ...systemPorts(o.test, sw),
    push: (p) => {
      const c = o.parent()?.webContents;
      if (c && !c.isDestroyed()) c.send(TRANSCRIPTS_EVENT, p);
    },
  });
  registerValidatedIpc<TranscriptsMethod>(ipcMain, {
    methods: TRANSCRIPTS_METHODS,
    channel: transcriptsChannel,
    args: TRANSCRIPTS_ARGS,
    handler: (m) => (service.handlers as Record<string, unknown>)[m] as (...a: unknown[]) => unknown,
    trusted: (e) => o.parent()?.webContents === e.sender,
  });
  return {
    ...service,
    async dispose() {
      await service.dispose();
      decoder.dispose();
    },
    testHook: {
      pick: (f) => void (sw.nextPick = f),
      clipboard: () => sw.copied,
    },
  };
}
