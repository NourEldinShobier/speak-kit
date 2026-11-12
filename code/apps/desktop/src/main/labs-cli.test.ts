import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { readLabs, runLabsCli } from "./labs-cli";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-labs-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const run = async (...argv: string[]) => {
  const out: string[] = [];
  const code = await runLabsCli(["app.exe", ...argv], dir, (l) => out.push(l));
  return { code, out: out.join("\n") };
};

describe("runLabsCli", () => {
  it("ignores command lines that are not labs commands", async () => {
    expect(await run("--hidden")).toEqual({ code: null, out: "" });
  });
  it("saves a switched lab next to the other settings", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true }));
    expect(await run("labs", "on", "verbose-log")).toEqual({ code: 0, out: "verbose-log on" });
    expect(JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"))).toMatchObject({ setupDone: true, labs: { "verbose-log": true, "hide-tray-icon": false } });
    expect(await readLabs(dir)).toEqual({ "verbose-log": true, "hide-tray-icon": false });
  });
  it("leaves the file alone for a bad command", async () => {
    writeFileSync(path.join(dir, "config.json"), '{"setupDone":true}');
    expect((await run("labs", "on", "nope")).code).toBe(3);
    expect(readFileSync(path.join(dir, "config.json"), "utf8")).toBe('{"setupDone":true}');
  });
  it("does not overwrite an unreadable file: it is set aside first", async () => {
    writeFileSync(path.join(dir, "config.json"), "{broken");
    await run("labs", "on", "verbose-log");
    expect(readFileSync(path.join(dir, "config.json.bad"), "utf8")).toBe("{broken");
  });
});
