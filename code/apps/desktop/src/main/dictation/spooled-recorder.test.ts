import { describe, expect, it } from "vite-plus/test";
import type { Clip, Recorder } from "@speakkit/dictation";
import { createSpooledRecorder } from "./spooled-recorder";
import type { Spool } from "./spool";

const clip = (): Clip => ({ pcm: new Float32Array(10), sampleRate: 16_000, peak: 0.5 });
const flush = () => new Promise<void>((r) => setImmediate(r));

function rig(o: { startOk?: boolean; stopThrows?: boolean } = {}) {
  const log: string[] = [];
  let n = 0;
  const spool: Spool = {
    async begin(rate, at) {
      const id = `t${n++}`;
      log.push(`begin:${id}:${rate}:${at}`);
      return id;
    },
    async append(id, pcm) {
      log.push(`append:${id}:${pcm.length}`);
    },
    async seal(id) {
      log.push(`seal:${id}`);
    },
    async finish(id) {
      log.push(`finish:${id}`);
    },
    async recover() {
      return [];
    },
  };
  const mic: Recorder = {
    async start() {
      return o.startOk === false ? { ok: false, code: "mic-denied" } : { ok: true };
    },
    async stop() {
      if (o.stopThrows) throw new Error("no audio");
      return clip();
    },
    async discard() {
      log.push("mic-discard");
    },
    speaking: () => true,
  };
  return { log, rec: createSpooledRecorder(mic, spool, { rate: 16_000, now: () => 7 }) };
}

describe("spooled recorder", () => {
  it("opens a take when the recording starts, adds the pieces, seals it at stop and removes it when settled done", async () => {
    const { rec, log } = rig();
    await rec.start({ prerollMs: 0 });
    rec.chunk(new Float32Array(5));
    rec.chunk(new Float32Array(3));
    const c = await rec.stop();
    await flush();
    rec.settled(c, true);
    await flush();
    expect(log).toEqual(["begin:t0:16000:7", "append:t0:5", "append:t0:3", "seal:t0", "finish:t0"]);
  });

  it("keeps the take when it is settled as not done, and settling the same take twice removes it once", async () => {
    const { rec, log } = rig();
    await rec.start({ prerollMs: 0 });
    const c = await rec.stop();
    rec.settled(c, false);
    await flush();
    expect(log).toEqual(["begin:t0:16000:7", "seal:t0"]);
    rec.settled(c, true);
    rec.settled(c, true);
    await flush();
    expect(log.filter((l) => l.startsWith("finish"))).toEqual(["finish:t0"]);
  });

  it("opens no take when the microphone does not start", async () => {
    const { rec, log } = rig({ startOk: false });
    expect(await rec.start({ prerollMs: 0 })).toEqual({ ok: false, code: "mic-denied" });
    rec.chunk(new Float32Array(5));
    await flush();
    expect(log).toEqual([]);
  });

  it("removes the take of a discarded recording", async () => {
    const { rec, log } = rig();
    await rec.start({ prerollMs: 0 });
    await rec.discard();
    await flush();
    expect(log).toEqual(["begin:t0:16000:7", "mic-discard", "finish:t0"]);
  });

  it("leaves the take on disk when the microphone window returns no audio, and ignores pieces after the stop", async () => {
    const { rec, log } = rig({ stopThrows: true });
    await rec.start({ prerollMs: 0 });
    await expect(rec.stop()).rejects.toThrow("no audio");
    rec.chunk(new Float32Array(5));
    await flush();
    expect(log).toEqual(["begin:t0:16000:7"]);
  });

  it("ignores settling a clip it never recorded (a replayed take)", async () => {
    const { rec, log } = rig();
    rec.settled(clip(), true);
    await flush();
    expect(log).toEqual([]);
  });

  it("keeps two takes apart", async () => {
    const { rec, log } = rig();
    await rec.start({ prerollMs: 0 });
    const a = await rec.stop();
    await rec.start({ prerollMs: 0 });
    rec.chunk(new Float32Array(2));
    const b = await rec.stop();
    await flush();
    rec.settled(a, true);
    rec.settled(b, true);
    await flush();
    expect(log).toEqual(["begin:t0:16000:7", "seal:t0", "begin:t1:16000:7", "append:t1:2", "seal:t1", "finish:t0", "finish:t1"]);
  });

  it("removes an adopted take when its clip is settled as done, and keeps it when not", async () => {
    const { rec, log } = rig();
    const a = clip();
    const b = clip();
    rec.adopt(a, "old-a");
    rec.adopt(b, "old-b");
    rec.settled(a, true);
    rec.settled(b, false);
    await flush();
    expect(log).toEqual(["finish:old-a"]);
  });

  it("passes speaking through", () => {
    expect(rig().rec.speaking?.()).toBe(true);
  });
});
