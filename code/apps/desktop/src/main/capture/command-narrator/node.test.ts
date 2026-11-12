import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newName, runCommand, writeTemp } from "./node";
import { createCommandNarrator } from ".";

describe("command narrator on the real system", () => {
  it("starts a program without a shell and returns what it printed", async () => {
    // a shell would turn the && into a second command; without one it is just text
    const out = await runCommand(process.execPath, ["-e", "console.log(process.argv.slice(1).join('|'))", "a b", "&&", "c"], 20_000);
    expect(out.trim()).toBe("a b|&&|c");
  });

  it("fails when the program fails and when it takes too long", async () => {
    await expect(runCommand(process.execPath, ["-e", "process.exit(3)"], 20_000)).rejects.toThrow();
    await expect(runCommand(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], 300)).rejects.toThrow();
  });

  it("writes a temporary file in a folder of its own and removes the folder with it", async () => {
    const f = await writeTemp("a.wav", Buffer.from("RIFF"));
    expect(readFileSync(f.path, "utf8")).toBe("RIFF");
    expect(path.basename(path.dirname(f.path))).toMatch(/^speakkit-stt-/);
    await f.remove();
    expect(existsSync(path.dirname(f.path))).toBe(false);
  });

  it("makes a different name each time", () => {
    expect(newName()).not.toBe(newName());
  });

  it("runs a stretch of speech through a program that prints the start and size of the file it was given", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "speakkit-stt-test-"));
    const script = path.join(dir, "fake-stt.js");
    writeFileSync(script, "const f = require('fs').readFileSync(process.argv[2]); console.log(f.subarray(0, 4).toString() + ' ' + f.length);");
    try {
      const narrator = createCommandNarrator({ command: () => `"${process.execPath}" "${script}" {audio}`, run: runCommand, writeTemp, newName, log: () => {} });
      expect(await narrator.transcribe(Int16Array.from([1, 2, 3, 4]))).toBe("RIFF 52");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
