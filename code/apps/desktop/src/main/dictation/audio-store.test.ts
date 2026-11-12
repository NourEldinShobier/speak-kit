import { mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createAudioStore, encodeWav } from "./audio-store";

let dir = "";
beforeEach(async () => void (dir = await mkdtemp(path.join(tmpdir(), "speakkit-audio-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const clip = (n: number, v = 0.5) => ({ pcm: new Float32Array(n).fill(v), sampleRate: 16_000, peak: v });
const store = (over: { trash?: (f: string) => Promise<boolean>; limitBytes?: number; evicted?: string[][] } = {}) =>
  createAudioStore({ dir, trash: over.trash ?? (async (f) => (await rm(f), true)), onEvicted: (f) => over.evicted?.push(f), ...(over.limitBytes && { limitBytes: over.limitBytes }) });

describe("audio store", () => {
  it("writes a 16-bit mono WAV and reads it back", async () => {
    const s = store();
    const name = await s.save("e1", clip(1600));
    expect(name).toBe("e1.wav");
    expect((await stat(path.join(dir, "e1.wav"))).size).toBe(44 + 3200);
    const back = await s.load("e1.wav");
    expect(back?.sampleRate).toBe(16_000);
    expect(back?.pcm.length).toBe(1600);
    expect(back?.pcm[0]).toBeCloseTo(0.5, 3);
    expect(back?.peak).toBeCloseTo(0.5, 3);
  });

  it("clamps samples and keeps nothing half written", async () => {
    expect(encodeWav({ pcm: Float32Array.from([2, -2]), sampleRate: 8000, peak: 1 }).readInt16LE(44)).toBe(32767);
    await store().save("a", clip(10));
    expect((await readdir(dir)).filter((n) => n.endsWith(".part"))).toEqual([]);
  });

  it("turns an id into a safe file name", async () => {
    expect(await store().save("../../evil name", clip(10))).toBe(".._.._evil_name.wav");
    expect(await readdir(dir)).toEqual([".._.._evil_name.wav"]);
  });

  it("removes the oldest recordings when the limit is passed and tells the history which", async () => {
    const evicted: string[][] = [];
    const s = store({ limitBytes: 2 * (44 + 200), evicted });
    await s.save("old", clip(100));
    await utimes(path.join(dir, "old.wav"), 1, 1);
    await s.save("mid", clip(100));
    await utimes(path.join(dir, "mid.wav"), 2, 2);
    await s.save("new", clip(100));
    expect((await readdir(dir)).sort()).toEqual(["mid.wav", "new.wav"]);
    expect(evicted).toEqual([["old.wav"]]);
  });

  it("keeps the old recording when it cannot be moved to the bin, and does not report it as removed", async () => {
    const evicted: string[][] = [];
    const s = store({ limitBytes: 244, evicted, trash: async () => false });
    await s.save("old", clip(100));
    await utimes(path.join(dir, "old.wav"), 1, 1);
    await s.save("new", clip(100));
    expect((await readdir(dir)).sort()).toEqual(["new.wav", "old.wav"]);
    expect(evicted).toEqual([]);
  });

  it("does not keep one recording that is larger than the whole limit", async () => {
    expect(await store({ limitBytes: 100 }).save("big", clip(1000))).toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });

  it("returns undefined for a recording that is gone or not a WAV, and false when the bin refuses", async () => {
    const s = store({ trash: async () => Promise.reject(new Error("locked")) });
    expect(await s.load("nope.wav")).toBeUndefined();
    await writeFile(path.join(dir, "junk.wav"), "not a wav");
    expect(await s.load("junk.wav")).toBeUndefined();
    expect(await s.trash("junk.wav")).toBe(false);
  });

  it("never reaches outside its folder, whatever name the history holds", async () => {
    const seen: string[] = [];
    const s = store({ trash: async (f) => (seen.push(f), true) });
    await s.trash("..\\..\\secret.txt");
    await s.trash("../x.wav");
    expect(seen.every((f) => path.dirname(f) === dir)).toBe(true);
  });
});
