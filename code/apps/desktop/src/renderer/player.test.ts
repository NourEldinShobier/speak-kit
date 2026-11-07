import { describe, expect, it } from "vite-plus/test";
import { ChunkPlayer, type AudioLike } from "./player";

function fakeAudio() {
  const sources: { started: number | null; stopped: boolean; onended: (() => void) | null; duration: number }[] = [];
  const calls: string[] = [];
  const ctx: AudioLike = {
    currentTime: 1,
    destination: {},
    createBuffer: (_c, length, rate) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      const s = { started: null as number | null, stopped: false, onended: null as (() => void) | null, duration: 0, buffer: null as unknown };
      sources.push(s);
      return {
        set buffer(b: unknown) {
          s.duration = (b as { duration: number }).duration;
        },
        get buffer() {
          return s.buffer;
        },
        get onended() {
          return s.onended;
        },
        set onended(f) {
          s.onended = f;
        },
        connect: () => {},
        start: (at: number) => void (s.started = at),
        stop: () => void (s.stopped = true),
      };
    },
    suspend: async () => void calls.push("suspend"),
    resume: async () => void calls.push("resume"),
  };
  return { ctx, sources, calls };
}
const audio = (ms: number) => ({ sampleRate: 1000, chunks: [new Int16Array(ms)] });

describe("ChunkPlayer", () => {
  it("schedules sentences back to back and reports start and end in order", () => {
    const f = fakeAudio();
    const log: string[] = [];
    const p = new ChunkPlayer(() => f.ctx, { started: (e, i) => log.push(`start ${e}:${i}`), done: (e, i) => log.push(`done ${e}:${i}`) });
    p.chunk(7, 0, audio(2000));
    p.chunk(7, 1, audio(1000));
    expect(f.sources[0]!.started).toBeCloseTo(1.03, 5);
    expect(f.sources[1]!.started).toBeCloseTo(3.03, 5);
    expect(log).toEqual(["start 7:0"]);
    f.sources[0]!.onended!();
    f.sources[1]!.onended!();
    expect(log).toEqual(["start 7:0", "done 7:0", "start 7:1", "done 7:1"]);
  });

  it("flush stops everything without reporting, and the next chunk starts fresh", () => {
    const f = fakeAudio();
    const log: string[] = [];
    const p = new ChunkPlayer(() => f.ctx, { started: (e, i) => log.push(`start ${e}:${i}`), done: (e, i) => log.push(`done ${e}:${i}`) });
    p.chunk(1, 0, audio(2000));
    p.chunk(1, 1, audio(2000));
    p.flush();
    expect(f.sources.every((s) => s.stopped && s.onended === null)).toBe(true);
    p.chunk(2, 5, audio(500));
    expect(f.sources[2]!.started).toBe(1.03);
    expect(log).toEqual(["start 1:0", "start 2:5"]);
  });

  it("pause suspends the context, resume resumes it", () => {
    const f = fakeAudio();
    const p = new ChunkPlayer(() => f.ctx, { started: () => {}, done: () => {} });
    p.chunk(1, 0, audio(100));
    p.pause();
    expect(p.paused).toBe(true);
    p.resume();
    expect(f.calls).toEqual(["suspend", "resume"]);
  });
});
