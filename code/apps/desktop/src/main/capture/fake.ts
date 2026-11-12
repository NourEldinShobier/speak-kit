import type { RecorderCommand, RecorderData, RecorderResult } from "../../shared/capture/contract";
import type { RecorderHost } from "./recorder-host";

type Omit2<T> = T extends unknown ? Omit<T, "id"> : never;

/** A tiny but valid JPEG header-less blob: only the bytes matter to the bundle, nothing decodes it. */
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

export interface FakeRecorderOptions {
  /** Frames to make during a recording. 0 makes a recording that fails with no pictures. */
  frames?: number;
  /** The microphone is missing. */
  noMic?: boolean;
}

/** The recorder window replaced by a scripted one, for tests: it streams frames and video bytes the way the page does and answers every command. */
export function fakeRecorder(o: FakeRecorderOptions = {}): RecorderHost & { options: FakeRecorderOptions; commands: string[] } {
  let sink: ((d: RecorderData) => void) | undefined;
  let startedAt = 0;
  const commands: string[] = [];
  const host = {
    options: o,
    commands,
    prepare: async () => true,
    onData: (cb: (d: RecorderData) => void) => {
      sink = cb;
    },
    close() {},
    owns: () => false,
    dispose() {},
    async call(cmd: Omit2<RecorderCommand>): Promise<RecorderResult> {
      commands.push(cmd.op);
      if (cmd.op === "start") {
        startedAt = Date.now();
        const n = host.options.frames ?? 3;
        for (let i = 0; i < n; i++) sink?.({ kind: "frame", atMs: i * 1000, jpeg: BYTES });
        if (n > 0) sink?.({ kind: "video", segment: 1, chunk: BYTES });
        if (!host.options.noMic) sink?.({ kind: "audio", chunk: new Int16Array(1600) });
        return { ok: true, micOk: !host.options.noMic };
      }
      if (cmd.op === "stop") return { ok: true, durationMs: Math.max(1000, Date.now() - startedAt), frames: host.options.frames ?? 3 };
      if (cmd.op === "sheet") return { ok: true, jpeg: BYTES };
      return { ok: true };
    },
  };
  return host;
}
