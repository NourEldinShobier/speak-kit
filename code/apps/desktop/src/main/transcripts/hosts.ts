import type { BrowserWindow, IpcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEC_COMMAND, DEC_READY, DEC_REPLY, MIC_CHUNK, MIC_COMMAND, MIC_ENDED, MIC_LEVEL, MIC_READY, MIC_REPLY } from "../../shared/transcripts/channels";
import { DecoderReplySchema, MicReplySchema, type DecoderCommand, type DecoderResult, type MicCommand, type MicResult } from "../../shared/transcripts/contract";
import { openRecorderWindow } from "../dictation/recorder-window";
import { createSecureWindow } from "../secure-window";
import { HiddenPage, type PageHandle } from "./hidden-page";
import type { FilePorts } from "./decode";
import type { MicPort } from "./mic-session";

const handle = (w: BrowserWindow): PageHandle => ({
  contents: w.webContents,
  destroy: () => !w.isDestroyed() && w.destroy(),
  get destroyed() {
    return w.isDestroyed();
  },
});

/** Decoding time allowed: a minute and a half to start with, plus a second for every megabyte of file. */
export const decodeDeadlineMs = (bytes: number): number => 90_000 + Math.ceil(bytes / 1_048_576) * 1_000;

/**
 * Compressed audio is decoded by the browser engine of a hidden page: it already has the mp3, AAC, FLAC and Vorbis/Opus decoders and runs on every platform
 * the app does. The page lives only for one file, so the decoded audio does not stay in memory.
 */
export function createDecoder(o: { ipcMain: IpcMain; distDir: string }): { decodeInPage: FilePorts["decodeInPage"]; dispose(): void } {
  const lost: DecoderResult = { ok: false, code: "decode-failed" };
  const page = new HiddenPage<DecoderCommand, DecoderResult>({
    ipcMain: o.ipcMain,
    channels: { command: DEC_COMMAND, reply: DEC_REPLY, ready: DEC_READY },
    reply: DecoderReplySchema,
    lost,
    open: () => {
      const w = createSecureWindow({ show: false, width: 320, height: 200, webPreferences: { backgroundThrottling: false, partition: "speakkit-transcripts-decoder" } }, () => {});
      w.loadURL(pathToFileURL(path.join(o.distDir, "../renderer", "decoder.html")).href).catch(() => {});
      return handle(w);
    },
  });
  let chain: Promise<unknown> = Promise.resolve();
  return {
    decodeInPage(bytes) {
      const run = chain.then(async () => {
        try {
          return await page.call({ bytes }, decodeDeadlineMs(bytes.length));
        } finally {
          page.close();
        }
      });
      chain = run.catch(() => {});
      return run;
    },
    dispose: () => page.dispose(),
  };
}

export interface MicHostOptions {
  ipcMain: IpcMain;
  distDir: string;
  /** Asked at every request, so a test can refuse the microphone. */
  micAllowed(): boolean;
}

/** The microphone page of the recorder: its own window and session, audio only. */
export function createMicHost(o: MicHostOptions): MicPort & { dispose(): void; owns(contents: Electron.WebContents): boolean } {
  const lost: MicResult = { ok: false, code: "mic-failed" };
  let onChunk: (pcm: Int16Array) => void = () => {};
  let onLevel: (n: number) => void = () => {};
  let onEnded: () => void = () => {};
  const page = new HiddenPage<MicCommand, MicResult>({
    ipcMain: o.ipcMain,
    channels: { command: MIC_COMMAND, reply: MIC_REPLY, ready: MIC_READY },
    reply: MicReplySchema,
    lost,
    open: () => handle(openRecorderWindow({ page: pathToFileURL(path.join(o.distDir, "../renderer", "trecorder.html")).href, partition: "speakkit-transcripts-recorder", micAllowed: o.micAllowed })),
  });
  page.on(MIC_CHUNK, (pcm) => pcm instanceof Int16Array && onChunk(pcm));
  page.on(MIC_LEVEL, (n) => typeof n === "number" && Number.isFinite(n) && onLevel(Math.min(1, Math.max(0, n))));
  page.on(MIC_ENDED, () => onEnded());
  return {
    start: () => page.call({ op: "start" }, 10_000),
    async stop() {
      await page.call({ op: "stop" }, 10_000);
      page.close(); // the microphone closes with the window
    },
    onChunk: (cb) => (onChunk = cb),
    onLevel: (cb) => (onLevel = cb),
    onEnded: (cb) => (onEnded = cb),
    owns: (c) => page.owns(c),
    dispose: () => page.dispose(),
  };
}
