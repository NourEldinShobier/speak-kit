import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { ClonedVoiceStore, WavError, analyzeClip, encodeWav, parseWav } from "../src";
import { clip } from "./clip-fixture";

const failed = (wav: Buffer) =>
  analyzeClip(parseWav(wav))
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);

describe("analyzeClip", () => {
  it("accepts a clean 8 s clip", () => {
    const r = analyzeClip(parseWav(clip(8)));
    expect(r.ok).toBe(true);
    expect(r.durationMs).toBe(8000);
  });
  it("rejects clips outside 5 to 30 s", () => {
    expect(failed(clip(3))).toEqual(["length"]);
    expect(analyzeClip(parseWav(clip(3))).checks[0]!.message).toBe("Clip is 3.0 s; at least 5.0 s is needed.");
    expect(failed(clip(31))).toEqual(["length"]);
  });
  it("rejects a low sample rate", () => expect(failed(clip(8, 8000))).toContain("sample-rate"));
  it("rejects silence and very quiet recordings", () => {
    expect(failed(clip(8, 24000, { amp: 0, floor: 0 }))).toEqual(expect.arrayContaining(["loudness", "silence"]));
    expect(failed(clip(8, 24000, { amp: 0.005 }))).toContain("loudness");
  });
  it("rejects a mostly silent clip and a noisy one", () => {
    expect(failed(clip(8, 24000, { speechShare: 0.2, floor: 0 }))).toContain("silence");
    expect(failed(clip(8, 24000, { amp: 0.25, floor: 0.12, speechShare: 1 }))).toContain("noise");
  });
});

describe("parseWav", () => {
  it("mixes stereo 16-bit down to mono", () => {
    const h = encodeWav(new Int16Array([16384, -16384, 8192, 8192]), 8000);
    h.writeUInt16LE(2, 22); // channels
    const w = parseWav(h);
    expect(w.sampleRate).toBe(8000);
    expect(Array.from(w.samples)).toEqual([0, 0.25]);
  });
  it("rejects non-WAV and compressed WAV", () => {
    expect(() => parseWav(Buffer.from("ID3 not a wave file at all, long enough to pass the size check....."))).toThrow(WavError);
    const h = encodeWav(new Int16Array(4), 8000);
    h.writeUInt16LE(85, 20); // MP3 in WAV
    expect(() => parseWav(h)).toThrow("unsupported WAV encoding");
  });
});

describe("ClonedVoiceStore", () => {
  it("persists, lists and deletes voices", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "vs-")), "voices");
    const s = new ClonedVoiceStore(dir);
    const v = await s.create({ name: "Maya", wav: clip(6), durationMs: 6000, checks: [], gender: "female" });
    expect(v.id).toMatch(/^cb_[0-9a-f]{8}$/);
    const again = new ClonedVoiceStore(dir);
    expect(again.list().map((x) => x.name)).toEqual(["Maya"]);
    expect(again.voices()[0]).toMatchObject({ id: v.id, name: "Maya", cloned: true, lang: "en-US" });
    expect(await again.delete(v.id)).toBe(true);
    expect(await again.delete(v.id)).toBe(false);
    expect(new ClonedVoiceStore(dir).list()).toEqual([]);
  });

  it("renames a voice and keeps its style across a restart", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "vs-")), "voices");
    const s = new ClonedVoiceStore(dir);
    const v = await s.create({ name: "Voice 1", wav: clip(6), durationMs: 6000, checks: [] });
    expect(s.style(v.id)).toEqual({});
    expect(await s.update(v.id, { name: "Maya", exaggeration: 0.8 })).toMatchObject({ id: v.id, name: "Maya", exaggeration: 0.8 });
    const again = new ClonedVoiceStore(dir);
    expect(again.style(v.id)).toEqual({ exaggeration: 0.8 });
    expect(again.voices()[0]!.name).toBe("Maya");
    expect(await again.update("cb_00000000", { name: "x" })).toBeUndefined();
  });

  it("keeps every voice when adds overlap", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "vs-")), "voices");
    const s = new ClonedVoiceStore(dir);
    await Promise.all(["A", "B", "C"].map((name) => s.create({ name, wav: clip(6), durationMs: 6000, checks: [] })));
    expect(
      new ClonedVoiceStore(dir)
        .list()
        .map((x) => x.name)
        .sort(),
    ).toEqual(["A", "B", "C"]);
  });

  it("sets a corrupt index aside as index.json.bad so the next write cannot destroy it", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "vs-")), "voices");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.json"), "[{ not json");
    const s = new ClonedVoiceStore(dir);
    expect(s.list()).toEqual([]);
    await s.create({ name: "Maya", wav: clip(6), durationMs: 6000, checks: [] });
    expect(readFileSync(join(dir, "index.json.bad"), "utf8")).toBe("[{ not json");
    expect(new ClonedVoiceStore(dir).list().map((x) => x.name)).toEqual(["Maya"]);
  });

  it("a failed index write leaves no voice and no clip behind", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "vs-")), "voices");
    mkdirSync(join(dir, "index.json"), { recursive: true }); // renaming the index over a directory fails
    const s = new ClonedVoiceStore(dir);
    await expect(s.create({ name: "Maya", wav: clip(6), durationMs: 6000, checks: [] })).rejects.toThrow();
    expect(s.list()).toEqual([]);
    expect(readdirSync(dir).filter((f) => f.endsWith(".wav"))).toEqual([]);
  });
});
