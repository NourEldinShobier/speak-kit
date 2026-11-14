import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ shell: {}, nativeImage: {} }));

import { History } from "./history";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
// the frames of a real recording live in a subfolder, with the separator of the system
const [F0, F1, F2] = [0, 1000, 2000].map((ms) => path.join("frames", `f-${String(ms).padStart(8, "0")}.jpg`)) as [string, string, string];
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "history-edit-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function setup(sheet?: (id: string, files: readonly string[]) => Promise<Buffer | undefined>, trim?: (v: Uint8Array, s: number, e: number) => Promise<Uint8Array | undefined>) {
  const h = new History({ folder: () => dir, log: () => undefined, now: () => 1, ...(sheet && { sheet }), ...(trim && { trim }) });
  await h.bundle.open("r1");
  await h.bundle.writeFile("r1", F0, "a");
  await h.bundle.writeFile("r1", F1, "b");
  await h.bundle.writeFile("r1", F2, "c");
  await h.bundle.writeFile("r1", "video.webm", "video");
  await h.store.add({
    id: "r1",
    kind: "recording",
    title: "T",
    at: 1,
    dir: "r1",
    durationMs: 3000,
    bytes: 0,
    media: "video.webm",
    frames: [F0, F1, F2],
    sheet: "sheet.jpg",
    words: [
      { text: "a", startMs: 100, endMs: 200 },
      { text: "b", startMs: 1500, endMs: 1600 },
    ],
    chips: ["saved"],
  });
  return h;
}

describe("saving an edit", () => {
  it("builds the contact sheet again from the edited pictures", async () => {
    const calls: (readonly string[])[] = [];
    const h = await setup(async (_id, files) => (calls.push(files), undefined));
    expect(await h.saveEdit("r1", F1, PNG)).toBe(true);
    expect(calls).toEqual([[F0, "edit-f-00001000.png", F2]]);
  });

  it("keeps both edits when two pictures are saved at once", async () => {
    const h = await setup(async () => undefined);
    await Promise.all([h.saveEdit("r1", F0, PNG), h.saveEdit("r1", F1, PNG)]);
    expect((await h.store.get("r1"))?.edits).toEqual({ [F0]: "edit-f-00000000.png", [F1]: "edit-f-00001000.png" });
  });

  it("the last sheet shows every edit", async () => {
    const calls: (readonly string[])[] = [];
    const h = await setup(async (_id, files) => (calls.push(files), undefined));
    await Promise.all([h.saveEdit("r1", F0, PNG), h.saveEdit("r1", F1, PNG)]);
    expect(calls.at(-1)).toEqual(["edit-f-00000000.png", "edit-f-00001000.png", F2]);
  });

  it("still saves the edit when the sheet cannot be built", async () => {
    const h = await setup(async () => Promise.reject(new Error("no recorder")));
    expect(await h.saveEdit("r1", F0, PNG)).toBe(true);
    expect((await h.store.get("r1"))?.edits).toEqual({ [F0]: "edit-f-00000000.png" });
  });

  it("does not bring a removed capture back", async () => {
    const h = await setup();
    const slow = h.bundle.writeFile.bind(h.bundle);
    h.bundle.writeFile = async (...a) => (await slow(...a), void (await h.store.remove(["r1"])));
    expect(await h.saveEdit("r1", F0, PNG)).toBe(false);
    expect(await h.store.get("r1")).toBeUndefined();
    await expect(readFile(path.join(dir, "r1", "edit-f-00000000.png"))).rejects.toThrow();
  });
});

describe("sent mark", () => {
  it("is added when sent and removed when taken back", async () => {
    const h = await setup();
    await h.markSent("r1");
    expect((await h.store.get("r1"))?.chips).toEqual(["saved", "sent"]);
    await h.unmarkSent("r1");
    expect((await h.store.get("r1"))?.chips).toEqual(["saved"]);
  });
});

describe("trimming a recording", () => {
  const cut = new Uint8Array([9, 9]);

  it("keeps the cut next to the original and reduces frames, words and sheet to what is kept", async () => {
    const sheets: (readonly string[])[] = [];
    const asked: [number, number][] = [];
    const h = await setup(
      async (_id, files) => (sheets.push(files), undefined),
      async (_v, s, e) => (asked.push([s, e]), cut),
    );
    expect(await h.trim("r1", 1000, 2500)).toBe(true);
    expect(asked).toEqual([[1000, 2500]]);
    expect([...(await readFile(path.join(dir, "r1", "video-trim.webm")))]).toEqual([9, 9]);
    expect(await readFile(path.join(dir, "r1", "video.webm"), "utf8")).toBe("video");
    const r = await h.store.get("r1");
    expect(r).toMatchObject({ media: "video-trim.webm", trim: { startMs: 1000, endMs: 2500 }, frames: [F1, F2], words: [{ text: "b", startMs: 1500, endMs: 1600 }] });
    expect(sheets).toEqual([[F1, F2]]);
  });

  it.each([
    ["a range under half a second", 1000, 1400],
    ["a start below zero", -5, 2000],
  ])("refuses %s", async (_n, s, e) => {
    const h = await setup(undefined, async () => cut);
    expect(await h.trim("r1", s, e)).toBe(false);
    expect((await h.store.get("r1"))?.media).toBe("video.webm");
  });

  it("changes nothing when the video could not be cut", async () => {
    for (const trim of [async () => undefined, async () => Promise.reject(new Error("page gone"))]) {
      const h = await setup(undefined, trim);
      expect(await h.trim("r1", 0, 2000)).toBe(false);
      expect((await h.store.get("r1"))?.media).toBe("video.webm");
    }
  });

  it("does not cut a recording made of several video files", async () => {
    const trim = vi.fn(async () => cut);
    const h = await setup(undefined, trim);
    await h.bundle.writeFile("r1", "video-2.webm", "more");
    expect(await h.trim("r1", 0, 2000)).toBe(false);
    expect(trim).not.toHaveBeenCalled();
  });

  it("has no cutter without a recorder", async () => {
    expect(await (await setup()).trim("r1", 0, 2000)).toBe(false);
  });
});
