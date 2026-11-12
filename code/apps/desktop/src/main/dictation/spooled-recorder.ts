import type { Clip, Recorder } from "@speakkit/dictation";
import { ignore } from "../../shared/ignore";
import type { Spool } from "./spool";

export interface SpooledRecorder extends Recorder {
  /** Samples of the running recording, as the microphone window hands them over. */
  chunk(pcm: Float32Array): void;
  /** A take has been dealt with: its copy on disk goes when it is done, and stays when it is not. */
  settled(clip: Clip, done: boolean): void;
  /** A take found on disk after a stop: settling this clip removes that take. */
  adopt(clip: Clip, id: string): void;
}

/**
 * A recorder that keeps every take on disk while it runs. The take is sealed when the recording ends and removed when the dictation reports it done, so a
 * quit or a crash anywhere in between leaves the audio for the next start. A take that cannot be written to disk is simply not kept; the dictation
 * itself never waits for the disk.
 */
export function createSpooledRecorder(inner: Recorder, spool: Spool, o: { rate: number; now?: () => number }): SpooledRecorder {
  const { rate, now = Date.now } = o;
  let current: Promise<string> | undefined;
  const ids = new WeakMap<Clip, Promise<string>>();
  const quietly = <T>(p: Promise<T>) => p.catch(ignore);
  return {
    async start(req) {
      const r = await inner.start(req);
      if (r.ok) current = spool.begin(rate, now());
      return r;
    },
    async stop() {
      const take = current;
      current = undefined;
      const clip = await inner.stop(); // when this throws, the take stays on disk as it was: the next start finds it
      if (take) {
        ids.set(clip, take);
        void quietly(take.then((id) => spool.seal(id)));
      }
      return clip;
    },
    async discard() {
      const take = current;
      current = undefined;
      await inner.discard();
      if (take) void quietly(take.then((id) => spool.finish(id)));
    },
    speaking: () => inner.speaking?.() ?? false,
    chunk(pcm) {
      const take = current;
      if (take) void quietly(take.then((id) => spool.append(id, pcm)));
    },
    adopt: (clip, id) => void ids.set(clip, Promise.resolve(id)),
    settled(clip, done) {
      const take = ids.get(clip);
      if (!take || !done) return;
      ids.delete(clip);
      void quietly(take.then((id) => spool.finish(id)));
    },
  };
}
