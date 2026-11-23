import type { BrowserWindow, IpcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEC_COMMAND, DEC_READY, DEC_REPLY } from "../../shared/transcripts/channels";
import { DecoderReplySchema, type DecoderCommand, type DecoderResult } from "../../shared/transcripts/contract";
import { settle } from "../dictation/models";
import { createSecureWindow } from "../secure-window";
import { HiddenPage, type PageHandle } from "./hidden-page";
import type { FilePorts } from "./decode";

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
  // "lost": the page crashed, timed out or never loaded; for a big file that usually means it ran out of memory.
  const lost: DecoderResult = { ok: false, code: "lost" };
  const page = new HiddenPage<DecoderCommand, DecoderResult>({
    ipcMain: o.ipcMain,
    channels: { command: DEC_COMMAND, reply: DEC_REPLY, ready: DEC_READY },
    reply: DecoderReplySchema,
    lost,
    open: () => {
      const w = createSecureWindow({ show: false, width: 320, height: 200, webPreferences: { backgroundThrottling: false, partition: "speakkit-transcripts-decoder" } }, () => {});
      // A page that cannot load never says it is ready; the host then drops the window and the file counts as undecodable.
      void settle(w.loadURL(pathToFileURL(path.join(o.distDir, "../renderer", "decoder.html")).href));
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
      chain = settle(run);
      return run;
    },
    dispose: () => page.dispose(),
  };
}
