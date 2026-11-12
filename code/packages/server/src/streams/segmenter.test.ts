import { describe, expect, it } from "vite-plus/test";
import { Segmenter } from "./segmenter";

const RATE = 16_000;
const tone = (ms: number, amp = 9000) => new Int16Array((RATE * ms) / 1000).fill(amp);
const quiet = (ms: number) => tone(ms, 0);
const cat = (...p: Int16Array[]) => {
  const out = new Int16Array(p.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of p) {
    out.set(x, at);
    at += x.length;
  }
  return out;
};
const spans = (segs: { startMs: number; endMs: number }[]) => segs.map((s) => [s.startMs, s.endMs]);

describe("Segmenter", () => {
  it("cuts at a pause of 700 ms after at least a second of speech", () => {
    const s = new Segmenter();
    const out = s.push(cat(tone(1500), quiet(720), tone(1200), quiet(900)));
    expect(spans(out)).toEqual([
      [0, 2220],
      [2220, 4140],
    ]);
    expect(out[0]!.pcm.length).toBe((RATE * 2220) / 1000);
  });

  it("does not cut at a pause inside a segment shorter than a second", () => {
    const s = new Segmenter();
    expect(s.push(cat(tone(90), quiet(720), tone(300)))).toEqual([]);
    expect(spans(s.flush())).toEqual([[0, 1110]]);
  });

  it("cuts a long stretch of speech at 15 seconds", () => {
    const s = new Segmenter();
    expect(spans(s.push(tone(31_020)))).toEqual([
      [0, 15_000],
      [15_000, 30_000],
    ]);
    expect(spans(s.flush())).toEqual([[30_000, 31_020]]);
  });

  it("drops silence before the first word except a 300 ms lead, and never returns a stretch without speech", () => {
    const s = new Segmenter();
    expect(s.push(quiet(5000))).toEqual([]);
    expect(s.flush()).toEqual([]);
    const t = new Segmenter();
    const out = t.push(cat(quiet(4980), tone(1200), quiet(800)));
    expect(spans(out)).toEqual([[4680, 6900]]);
  });

  it("takes audio in any chunk size and gives the same segments", () => {
    const audio = cat(tone(1500), quiet(720), tone(1200), quiet(900));
    const whole = new Segmenter().push(audio);
    const s = new Segmenter();
    const pieces: ReturnType<Segmenter["push"]> = [];
    for (let at = 0; at < audio.length; at += 777) pieces.push(...s.push(audio.subarray(at, at + 777)));
    expect(spans(pieces)).toEqual(spans(whole));
    expect(pieces.map((p) => p.pcm.length)).toEqual(whole.map((p) => p.pcm.length));
  });

  it("flush returns the open speech once and then nothing, and ignores a tail under 150 ms", () => {
    const s = new Segmenter();
    s.push(tone(480));
    expect(spans(s.flush())).toEqual([[0, 480]]);
    expect(s.flush()).toEqual([]);
    const t = new Segmenter();
    t.push(tone(100));
    expect(t.flush()).toEqual([]);
  });

  it("keeps counting time across segments", () => {
    const s = new Segmenter();
    expect(spans(s.push(cat(tone(1200), quiet(810))))).toEqual([[0, 1920]]);
    expect(spans(s.push(cat(tone(1200), quiet(810))))).toEqual([[1920, 3930]]);
  });
});
