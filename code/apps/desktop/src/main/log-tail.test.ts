import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { logSince, readLogTail } from "./log-tail";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-log-"));
  file = path.join(dir, "main.log");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("log tail", () => {
  it("a missing file is an empty log", async () => {
    expect(await readLogTail(file, 5)).toEqual({ size: 0, lines: [] });
    expect(await logSince(file, 0)).toEqual({ size: 0, lines: [] });
  });

  it("returns the last lines", async () => {
    writeFileSync(file, "one\ntwo\nthree\n");
    expect((await readLogTail(file, 2)).lines).toEqual(["two", "three"]);
  });

  it("a huge file is read from its end only and the cut first line is dropped", async () => {
    writeFileSync(file, `${"x".repeat(200_000)}\nlast1\nlast2\n`);
    const r = await readLogTail(file, 10);
    expect(r.lines).toEqual(["last1", "last2"]);
  });

  it("reports no change until the file grows", async () => {
    writeFileSync(file, "a\n");
    const first = await logSince(file, 0);
    expect(first.lines).toEqual(["a"]);
    expect(await logSince(file, first.size)).toEqual({ size: first.size, lines: null });
    appendFileSync(file, "b\n");
    expect((await logSince(file, first.size)).lines).toEqual(["a", "b"]);
  });

  it("a rotated, smaller file is read again", async () => {
    writeFileSync(file, "a\nb\nc\n");
    const big = await logSince(file, 0);
    writeFileSync(file, "z\n");
    expect((await logSince(file, big.size)).lines).toEqual(["z"]);
  });
});
