import { app, clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { readFile, stat, open } from "node:fs/promises";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import { TRANSCRIPTS_EVENT, TRANSCRIPTS_METHODS, transcriptsChannel, type TranscriptsMethod } from "../../shared/transcripts/channels";
import { TRANSCRIPTS_ARGS } from "../../shared/transcripts/contract";
import { registerValidatedIpc } from "../ipc-register";
import { createDecoder, createMicHost } from "./hosts";
import { createTranscriptsService, type TranscriptsService } from "./service";

export interface TranscriptsOptions {
  distDir: string;
  parent(): BrowserWindow | null;
  /** The speech engine and model are dictation's: transcripts borrow them. */
  dictation: DictationService;
  /** The test hook is on: the file chooser is replaced by what the test sets, and the microphone can be refused. */
  test: boolean;
  /** Called when the recorder or a job changes state (the tray follows). */
  onChange(): void;
}

export interface TranscriptsFeature extends TranscriptsService {
  /** Tests only: the next file chooser answer, and whether the microphone is refused. */
  testHook: { pick(file: string | null): void; pickFolder(dir: string | null): void; denyMic(on: boolean): void; revealed(): string[]; clipboard(): string };
}

/** Transcripts in the desktop app: the store, the hidden decoder and microphone pages, and the IPC the History page calls. */
export function setupTranscripts(ctx: Ctx, o: TranscriptsOptions): TranscriptsFeature {
  let nextPick: string | null | undefined;
  let nextFolder: string | null | undefined;
  let micDenied = false;
  const revealed: string[] = [];
  let copied = "";
  const decoder = createDecoder({ ipcMain, distDir: o.distDir });
  const mic = createMicHost({ ipcMain, distDir: o.distDir, micAllowed: () => !micDenied });
  const parentWindow = () => o.parent()?.webContents;

  const service = createTranscriptsService(ctx, {
    dataDir: app.getPath("userData"),
    documentsDir: app.getPath("documents"),
    stt: o.dictation.stt,
    model: () => ctx.config.dictation.model,
    modelName: () => {
      const m = o.dictation.models.views().find((v) => v.selected);
      return { name: m?.name ?? "Speech model", installed: !!m?.installed };
    },
    dictationBusy: () => o.dictation.state.status !== "idle" && o.dictation.state.status !== "error",
    files: {
      stat: (f) => stat(f).then((s) => (s.isFile() ? { size: s.size } : undefined)),
      head: async (f, n) => {
        const h = await open(f, "r");
        try {
          const buf = new Uint8Array(n);
          const { bytesRead } = await h.read(buf, 0, n, 0);
          return buf.subarray(0, bytesRead);
        } finally {
          await h.close();
        }
      },
      read: (f) => readFile(f),
      decodeInPage: decoder.decodeInPage,
      pause: () => new Promise((r) => setImmediate(r)),
    },
    mic,
    dialog: {
      async pickFile() {
        if (o.test && nextPick !== undefined) return nextPick;
        const r = await dialog.showOpenDialog({
          properties: ["openFile"],
          filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "mp4", "flac", "ogg", "oga", "opus", "aac"] }, { name: "All files", extensions: ["*"] }],
        });
        return r.canceled ? null : (r.filePaths[0] ?? null);
      },
      async pickFolder() {
        if (o.test && nextFolder !== undefined) return nextFolder;
        const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
        return r.canceled ? null : (r.filePaths[0] ?? null);
      },
    },
    shell: {
      reveal: (file) => (o.test ? void revealed.push(file) : shell.showItemInFolder(file)),
      openFolder: async (dir) => void (await shell.openPath(dir)),
    },
    clipboard: { writeText: (t) => (o.test ? void (copied = t) : clipboard.writeText(t)) },
    push: (p) => {
      const c = parentWindow();
      if (c && !c.isDestroyed()) c.send(TRANSCRIPTS_EVENT, p);
    },
    changed: o.onChange,
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
      mic.dispose();
    },
    testHook: {
      pick: (f) => void (nextPick = f),
      pickFolder: (d) => void (nextFolder = d),
      denyMic: (on) => void (micDenied = on),
      revealed: () => revealed,
      clipboard: () => copied,
    },
  };
}
