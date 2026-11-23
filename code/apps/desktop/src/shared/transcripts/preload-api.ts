import type { IpcRenderer } from "electron";
import { DEC_COMMAND, DEC_READY, DEC_REPLY, TRANSCRIPTS_EVENT, TRANSCRIPTS_METHODS, transcriptsChannel } from "./channels";
import type { DecoderCommand, Push, TranscriptsBridge } from "./contract";

/** `pathOf` is Electron's webUtils.getPathForFile, passed in by the preload, which may import Electron. */
export function transcriptsBridge(ipc: IpcRenderer, pathOf: (file: File) => string): TranscriptsBridge {
  const methods = Object.fromEntries(TRANSCRIPTS_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(transcriptsChannel(m), ...args)]));
  const on = <T>(channel: string, cb: (v: T) => void) => {
    const h = (_: unknown, v: T) => cb(v);
    ipc.on(channel, h);
    return () => void ipc.off(channel, h);
  };
  return {
    ...methods,
    onPush: (cb) => on<Push>(TRANSCRIPTS_EVENT, cb),
    pathOf,
    decoder: {
      onCommand: (cb) => on<DecoderCommand>(DEC_COMMAND, cb),
      reply: (id, r) => ipc.send(DEC_REPLY, id, r),
      ready: () => ipc.send(DEC_READY),
    },
  } as TranscriptsBridge;
}
