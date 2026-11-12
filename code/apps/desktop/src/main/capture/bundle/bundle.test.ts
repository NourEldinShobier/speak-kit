import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBundle, videoName, type Bundle } from "./index";

let root: string;
let bundle: Bundle;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sk-bundle-"));
  bundle = createBundle(root);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("capture bundle", () => {
  it("writes frames with their time in the name and lists them in order", async () => {
    await bundle.open("a");
    await bundle.frame("a", 2500, new Uint8Array([1]));
    expect(await bundle.frame("a", 40, new Uint8Array([2]))).toEqual({ atMs: 40, file: path.join("frames", "f-00000040.jpg") });
    expect((await bundle.frames("a")).map((f) => f.atMs)).toEqual([40, 2500]);
  });
  it("appends video chunks in the order they were sent, one file per segment", async () => {
    await bundle.open("a");
    await Promise.all([bundle.video("a", 1, new Uint8Array([1, 2])), bundle.video("a", 1, new Uint8Array([3])), bundle.video("a", 2, new Uint8Array([9]))]);
    expect([...(await bundle.readFile("a", "video.webm"))!]).toEqual([1, 2, 3]);
    expect([...(await bundle.readFile("a", videoName(2)))!]).toEqual([9]);
  });
  it("keeps the microphone track as 16-bit samples", async () => {
    await bundle.open("a");
    await bundle.audio("a", Int16Array.from([1, -2]));
    await bundle.audio("a", Int16Array.from([300]));
    expect([...(await bundle.pcm("a"))!]).toEqual([1, -2, 300]);
  });
  it("answers undefined or empty for what was never written", async () => {
    expect(await bundle.pcm("none")).toBeUndefined();
    expect(await bundle.frames("none")).toEqual([]);
    expect(await bundle.readFile("none", "x")).toBeUndefined();
    expect(await bundle.bytes("none")).toBe(0);
  });
  it("counts the bytes of the whole folder and removes it", async () => {
    await bundle.open("a");
    await bundle.frame("a", 0, new Uint8Array(10));
    await bundle.video("a", 1, new Uint8Array(5));
    expect(await bundle.bytes("a")).toBe(15);
    await bundle.remove("a");
    expect(await bundle.bytes("a")).toBe(0);
    await bundle.remove("a");
  });
  it("stores words as json", async () => {
    await bundle.open("a");
    await bundle.words("a", [{ text: "hi", startMs: 0, endMs: 5 }]);
    expect(JSON.parse((await bundle.readFile("a", "words.json"))!.toString())).toEqual([{ text: "hi", startMs: 0, endMs: 5 }]);
  });
  it("names the first video video.webm", () => {
    expect([videoName(0), videoName(1), videoName(3)]).toEqual(["video.webm", "video.webm", "video-3.webm"]);
  });
});
