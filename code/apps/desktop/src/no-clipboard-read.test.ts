import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

/** Speak Kit never reads the clipboard on its own (docs/privacy.md). The user pastes with Ctrl+V into a text field. */
const FORBIDDEN = /clipboard\.readText|readClipboard|clipboard-read/;
/** The one reader: the selection capture sends Ctrl+C, reads the result, and restores the user's clipboard exactly (selection.ts). */
const ALLOWED = new Set(["main/system/clipboard.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("no clipboard reading", () => {
  it("only the selection reader reads the clipboard in main and renderer", () => {
    const root = path.join(__dirname);
    const hits = ["main", "renderer"]
      .flatMap((d) => files(path.join(root, d)))
      .filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f).replaceAll("\\", "/"));
    expect(hits.filter((h) => !ALLOWED.has(h))).toEqual([]);
  });
});
