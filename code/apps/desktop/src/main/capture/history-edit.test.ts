import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ shell: {}, nativeImage: {} }));

import { History } from "./history";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "history-edit-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function setup(sheet?: (id: string, files: readonly string[]) => Promise<Buffer | undefined>) {
  const h = new History({ folder: () => dir, log: () => undefined, now: () => 1, ...(sheet && { sheet }) });
  await h.bundle.open("r1");
  await h.bundle.writeFile("r1", "f-0.jpg", "a");
  await h.bundle.writeFile("r1", "f-1000.jpg", "b");
  await h.store.add({ id: "r1", kind: "recording", title: "T", at: 1, dir: "r1", bytes: 0, media: "video.webm", frames: ["f-0.jpg", "f-1000.jpg"], sheet: "sheet.jpg", chips: ["saved"] });
  return h;
}

describe("saving an edit", () => {
  it("builds the contact sheet again from the edited pictures", async () => {
    const calls: (readonly string[])[] = [];
    const h = await setup(async (_id, files) => (calls.push(files), undefined));
    expect(await h.saveEdit("r1", "f-1000.jpg", PNG)).toBe(true);
    expect(calls).toEqual([["f-0.jpg", "edit-f-1000.png"]]);
  });

  it("keeps both edits when two pictures are saved at once", async () => {
    const h = await setup(async () => undefined);
    await Promise.all([h.saveEdit("r1", "f-0.jpg", PNG), h.saveEdit("r1", "f-1000.jpg", PNG)]);
    expect((await h.store.get("r1"))?.edits).toEqual({ "f-0.jpg": "edit-f-0.png", "f-1000.jpg": "edit-f-1000.png" });
  });

  it("the last sheet shows every edit", async () => {
    const calls: (readonly string[])[] = [];
    const h = await setup(async (_id, files) => (calls.push(files), undefined));
    await Promise.all([h.saveEdit("r1", "f-0.jpg", PNG), h.saveEdit("r1", "f-1000.jpg", PNG)]);
    expect(calls.at(-1)).toEqual(["edit-f-0.png", "edit-f-1000.png"]);
  });

  it("still saves the edit when the sheet cannot be built", async () => {
    const h = await setup(async () => Promise.reject(new Error("no recorder")));
    expect(await h.saveEdit("r1", "f-0.jpg", PNG)).toBe(true);
    expect((await h.store.get("r1"))?.edits).toEqual({ "f-0.jpg": "edit-f-0.png" });
  });

  it("does not bring a removed capture back", async () => {
    const h = await setup();
    const slow = h.bundle.writeFile.bind(h.bundle);
    h.bundle.writeFile = async (...a) => (await slow(...a), void (await h.store.remove(["r1"])));
    expect(await h.saveEdit("r1", "f-0.jpg", PNG)).toBe(false);
    expect(await h.store.get("r1")).toBeUndefined();
    await expect(readFile(path.join(dir, "r1", "edit-f-0.png"))).rejects.toThrow();
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
