import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { readLabs, runLabsCli } from "./labs-cli";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-labs-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const file = () => path.join(dir, "config.json");
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
    writeFileSync(file(), JSON.stringify({ setupDone: true }));
    expect(await run("labs", "on", "verbose-log")).toEqual({ code: 0, out: "verbose-log on" });
    expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({ setupDone: true, labs: { "verbose-log": true, "hide-tray-icon": false } });
    expect(await readLabs(dir)).toEqual({ "verbose-log": true, "hide-tray-icon": false });
  });
  it("creates the file when there is none", async () => {
    expect((await run("labs", "on", "hide-tray-icon")).code).toBe(0);
    expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({ labs: { "hide-tray-icon": true, "verbose-log": false } });
  });
  it("leaves the file alone for a bad command", async () => {
    writeFileSync(file(), '{"setupDone":true}');
    expect((await run("labs", "on", "nope")).code).toBe(3);
    expect(readFileSync(file(), "utf8")).toBe('{"setupDone":true}');
  });
  it("keeps unknown keys and invalid fields exactly as stored", async () => {
    writeFileSync(file(), JSON.stringify({ futureThing: { a: [1] }, speed: "fast", setupDone: true, labs: { gone: true, "verbose-log": "yes" } }));
    await run("labs", "on", "hide-tray-icon");
    expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({
      futureThing: { a: [1] },
      speed: "fast",
      setupDone: true,
      labs: { "hide-tray-icon": true, "verbose-log": false },
    });
  });
  it.each(["{broken", "null", "[1]", "7"])("does not touch an unreadable file (%s): exit 4 and nothing renamed or written", async (text) => {
    writeFileSync(file(), text);
    const r = await run("labs", "on", "verbose-log");
    expect(r.code).toBe(4);
    expect(r.out).toContain("cannot be read");
    expect(readFileSync(file(), "utf8")).toBe(text);
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });
  it("list works without writing anything", async () => {
    writeFileSync(file(), '{"labs":{"verbose-log":true}}');
    const r = await run("labs", "list");
    expect(r.code).toBe(0);
    expect(r.out).toContain("verbose-log\ton");
    expect(readFileSync(file(), "utf8")).toBe('{"labs":{"verbose-log":true}}');
  });
  it("leaves no temporary file behind", async () => {
    await run("labs", "on", "verbose-log");
    expect(readdirSync(dir)).toEqual(["config.json"]);
    expect(existsSync(file() + ".bad")).toBe(false);
  });
});

describe("readLabs", () => {
  it("is null for an unreadable file and never renames it", async () => {
    writeFileSync(file(), "{broken");
    expect(await readLabs(dir)).toBeNull();
    expect(readFileSync(file(), "utf8")).toBe("{broken");
  });
  it("gives defaults when the file is missing", async () => {
    expect(await readLabs(dir)).toEqual({ "hide-tray-icon": false, "verbose-log": false });
  });
});
