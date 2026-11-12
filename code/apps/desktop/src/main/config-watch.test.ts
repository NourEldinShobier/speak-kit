import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { watchConfigFile } from "./config-watch";

let dir = "";
let file = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "speakkit-cfgwatch-"));
  file = path.join(dir, "config.json");
  await writeFile(file, "{}");
});
afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }));

const until = async (f: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return f();
};

describe("watchConfigFile", () => {
  it("reports an edit made to the file with the changed fields", async () => {
    const edits: unknown[] = [];
    const w = watchConfigFile({ file, current: () => parseConfig({}), onEdit: (e) => edits.push(e), debounceMs: 30 });
    await writeFile(file, JSON.stringify({ closeAction: "quit" }));
    expect(await until(() => edits.length > 0)).toBe(true);
    expect(edits[0]).toEqual({ kind: "changed", patch: { closeAction: "quit" }, keys: ["closeAction"], repaired: [] });
    w.dispose();
  });

  it("says nothing when the file matches what the app holds", async () => {
    const edits: unknown[] = [];
    const w = watchConfigFile({ file, current: () => parseConfig({ closeAction: "quit" }), onEdit: (e) => edits.push(e), debounceMs: 30 });
    await writeFile(file, JSON.stringify({ closeAction: "quit" }));
    await new Promise((r) => setTimeout(r, 300));
    expect(edits).toEqual([]);
    w.dispose();
  });

  it("reports a file that stays broken, but not one that was only half written for a moment", async () => {
    let bad = 0;
    const edits: unknown[] = [];
    const w = watchConfigFile({ file, current: () => parseConfig({}), onEdit: (e) => edits.push(e), onUnreadable: () => bad++, debounceMs: 30 });
    await writeFile(file, '{"closeAction": ');
    await new Promise((r) => setTimeout(r, 20));
    await writeFile(file, JSON.stringify({ closeAction: "quit" }));
    expect(await until(() => edits.length > 0)).toBe(true);
    expect(bad).toBe(0);
    await writeFile(file, "{ nope");
    expect(await until(() => bad > 0)).toBe(true);
    w.dispose();
  });

  it("ignores edits after dispose", async () => {
    const edits: unknown[] = [];
    const w = watchConfigFile({ file, current: () => parseConfig({}), onEdit: (e) => edits.push(e), debounceMs: 30 });
    w.dispose();
    await writeFile(file, JSON.stringify({ closeAction: "quit" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(edits).toEqual([]);
  });
});
