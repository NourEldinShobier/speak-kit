import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { LabsState } from "../shared/labs";
import { readLabsFile } from "../cli/labs-file";
import { watchLabsFile } from "./labs-watch";

let dir: string;
let stop: (() => void) | undefined;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-watch-"));
});
afterEach(() => {
  stop?.();
  stop = undefined;
  rmSync(dir, { recursive: true, force: true });
});
const file = () => path.join(dir, "config.json");
const OFF: LabsState = { "hide-tray-icon": false, "verbose-log": false };

function setup(current: LabsState = OFF) {
  const applied: LabsState[] = [];
  const warnings: string[] = [];
  let now = current;
  stop = watchLabsFile({ dir, read: () => readLabsFile(dir), current: () => now, apply: (l) => (applied.push(l), (now = l)), warn: (m) => warnings.push(m), delayMs: 20 });
  return { applied, warnings };
}

describe("watchLabsFile", () => {
  it("applies labs that were changed in the file by something else", async () => {
    const t = setup();
    writeFileSync(file(), JSON.stringify({ labs: { "verbose-log": true } }));
    await vi.waitFor(() => expect(t.applied).toEqual([{ "hide-tray-icon": false, "verbose-log": true }]));
  });
  it("reads once for a write that arrives in several events", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) writeFileSync(file(), JSON.stringify({ labs: { "hide-tray-icon": true } }));
    await vi.waitFor(() => expect(t.applied).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 100));
    expect(t.applied).toHaveLength(1);
  });
  it("ignores a write that leaves the labs as they are (the app's own saves)", async () => {
    const t = setup();
    writeFileSync(file(), JSON.stringify({ speed: 2, labs: OFF }));
    await new Promise((r) => setTimeout(r, 120));
    expect(t.applied).toEqual([]);
  });
  it("ignores other files in the folder", async () => {
    const t = setup();
    writeFileSync(path.join(dir, "token"), "x");
    writeFileSync(path.join(dir, "config.json.bad"), JSON.stringify({ labs: { "verbose-log": true } }));
    await new Promise((r) => setTimeout(r, 120));
    expect(t.applied).toEqual([]);
  });
  it("keeps the current labs and warns once when the file cannot be read", async () => {
    const t = setup();
    writeFileSync(file(), "{broken");
    await vi.waitFor(() => expect(t.warnings).toHaveLength(1));
    writeFileSync(file(), "{still broken");
    await new Promise((r) => setTimeout(r, 120));
    expect(t.warnings).toHaveLength(1);
    expect(t.applied).toEqual([]);
    writeFileSync(file(), JSON.stringify({ labs: { "verbose-log": true } }));
    await vi.waitFor(() => expect(t.applied).toHaveLength(1));
  });
  it("a read that throws is a warning, not a crash", async () => {
    const warnings: string[] = [];
    stop = watchLabsFile({
      dir,
      read: async () => {
        throw new Error("EBUSY");
      },
      current: () => OFF,
      apply: () => {},
      warn: (m) => warnings.push(m),
      delayMs: 10,
    });
    writeFileSync(file(), "{}");
    await vi.waitFor(() => expect(warnings).toEqual(["labs: re-reading the settings failed: EBUSY"]));
  });
  it("does not throw for a folder that does not exist", () => {
    const warnings: string[] = [];
    stop = watchLabsFile({ dir: path.join(dir, "nope"), read: async () => OFF, current: () => OFF, apply: () => {}, warn: (m) => warnings.push(m) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("not watching");
  });
  it("stops reading after it is stopped", async () => {
    const t = setup();
    stop!();
    writeFileSync(file(), JSON.stringify({ labs: { "verbose-log": true } }));
    await new Promise((r) => setTimeout(r, 120));
    expect(t.applied).toEqual([]);
  });
});
