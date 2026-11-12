import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { AutomationFault } from "@speakkit/server";
import { runCli } from "./commands";
import type { Launcher } from "./launcher";
import { fakeIo, startApp } from "./testing/kit";

let app: Awaited<ReturnType<typeof startApp>> | undefined;
afterEach(async () => {
  await app?.server.close();
  app = undefined;
});
const abs = (f: string) => path.resolve(process.cwd(), f);

/** Runs a command line against the real server and returns what a terminal would show. */
async function cli(argv: string[], io: Parameters<typeof fakeIo>[0] = {}, opts: { noHost?: boolean } = {}) {
  app ??= await startApp(opts);
  const t = fakeIo({ env: app.env, ...io });
  const code = await runCli(argv, t.io);
  return { code, out: t.out, err: t.err, files: t.files, host: app.host };
}

describe("speak", () => {
  it("reads text and says how long it will take", async () => {
    const r = await cli(["speak", "Hello", "there."]);
    expect(r).toMatchObject({ code: 0, out: ["reading 2 sentences, about 3 s"], err: [] });
    expect(r.host.spoken).toEqual([{ text: "Hello there." }]);
  });
  it("--json prints the result and nothing else", async () => {
    const r = await cli(["speak", "Hi.", "--json"]);
    expect(r.out).toEqual(['{"id":"r1","position":0,"sentences":2,"estimatedMs":3000}']);
  });
  it("--queue waits and tells the place in line", async () => {
    await cli(["speak", "First."]);
    const r = await cli(["speak", "--queue", "Second."]);
    expect(r.out).toEqual(["queued, number 1 in line"]);
    expect(r.host.spoken.at(-1)).toEqual({ text: "Second.", mode: "queue" });
  });
  it("--print prints the sentences, one per line, and speaks nothing", async () => {
    const r = await cli(["speak", "--print", "Whatever"]);
    expect(r.out).toEqual(["First part.", "Second part."]);
    expect(r.host.spoken).toEqual([{ text: "Whatever", dryRun: true }]);
    expect(r.host.status.status).toBe("idle");
  });
  it("reads a file named on the command line", async () => {
    const r = await cli(["speak", "notes.md"], { files: { [abs("notes.md")]: "# Notes\nBody." } });
    expect(r.host.spoken).toEqual([{ text: "# Notes\nBody." }]);
  });
  it("reads a word that only looks like a file name when there is no such file", async () => {
    const r = await cli(["speak", "notes.md"]);
    expect(r.host.spoken).toEqual([{ text: "notes.md" }]);
  });
  it("refuses a file over 64 MiB before reading it: too_large, exit 1, nothing spoken", async () => {
    const f = abs("big.txt");
    const r = await cli(["speak", "big.txt"], { files: { [f]: "x" }, sizes: { [f]: 71 * 1024 * 1024 } });
    expect(r.code).toBe(1);
    expect(r.err).toEqual(["too_large: big.txt is 71 MiB. The limit is 64 MiB."]);
    expect(r.host.spoken).toEqual([]);
  });
  it("accepts a file of exactly 64 MiB", async () => {
    const f = abs("edge.txt");
    const r = await cli(["speak", "edge.txt"], { files: { [f]: "Edge." }, sizes: { [f]: 64 * 1024 * 1024 } });
    expect(r.code).toBe(0);
  });
  it("reads standard input for -", async () => {
    const r = await cli(["speak", "-"], { stdinText: "From a pipe." });
    expect(r.host.spoken).toEqual([{ text: "From a pipe." }]);
  });
  it("text over 100 000 characters is too_large, with exit code 1", async () => {
    const r = await cli(["speak", "-"], { stdinText: "a".repeat(100_001) });
    expect([r.code, r.err[0]?.split(":")[0]]).toEqual([1, "too_large"]);
  });
  it("empty standard input is invalid_input with exit code 2", async () => {
    const r = await cli(["speak", "-"], { stdinText: "  \n" });
    expect([r.code, r.err[0]?.split(":")[0]]).toEqual([2, "invalid_input"]);
  });
  it("needs something to read: exit 2", async () => {
    const r = await cli(["speak"]);
    expect([r.code, r.err[0]]).toEqual([2, "invalid_input: speak needs some text, a file name, or - for standard input."]);
  });
  it.each([[["speak", "--print", "--queue", "x"]], [["speak", "--print", "--wait", "x"]], [["speak", "--out", "a.mp3", "--queue", "x"]], [["speak", "--out", "a.txt", "x"]]])(
    "refuses the combination %j with exit code 2",
    async (argv) => {
      const r = await cli(argv);
      expect(r.code).toBe(2);
      expect(r.host.spoken).toEqual([]);
    },
  );
  it("--wait returns when everything has been read", async () => {
    app = await startApp();
    const host = app.host;
    const t = fakeIo({ env: app.env });
    const run = runCli(["speak", "--wait", "Hi."], t.io);
    await new Promise((r) => setTimeout(r, 150));
    host.push({ status: "finished" });
    expect(await run).toBe(0);
    expect(t.out[0]).toContain("reading");
  });
  it("--wait keeps waiting while readings are queued behind", async () => {
    app = await startApp();
    const host = app.host;
    const t = fakeIo({ env: app.env });
    let done = false;
    const run = runCli(["speak", "--wait", "Hi."], t.io).then((c) => ((done = true), c));
    await new Promise((r) => setTimeout(r, 100));
    host.push({ status: "finished", queued: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(done).toBe(false);
    host.push({ status: "finished", queued: 0 });
    expect(await run).toBe(0);
  });
  it("--wait fails when the reading ends in an error", async () => {
    app = await startApp();
    const host = app.host;
    const t = fakeIo({ env: app.env });
    const run = runCli(["speak", "--wait", "Hi."], t.io);
    await new Promise((r) => setTimeout(r, 100));
    host.push({ status: "error" });
    expect(await run).toBe(1);
    expect(t.err[0]).toBe("failed: the reading stopped with an error.");
  });
  it("saves audio with --out and reports the path", async () => {
    app = await startApp();
    app.host.exportStages.push("rendering", "encoding", "done");
    const t = fakeIo({ env: app.env, files: { [abs("notes.md")]: "Body." } });
    expect(await runCli(["speak", "notes.md", "--out", "notes.mp3"], t.io)).toBe(0);
    expect(app.host.exports).toEqual([{ text: "Body.", out: abs("notes.mp3") }]);
    expect(t.out).toEqual([`saved ${abs("notes.mp3")}`]);
    expect(app.host.spoken).toEqual([]);
  });
  it("a failed or cancelled export exits 1 and says why", async () => {
    app = await startApp();
    app.host.exportStages.push("error");
    const a = fakeIo({ env: app.env });
    expect(await runCli(["speak", "Hi.", "--out", "a.wav"], a.io)).toBe(1);
    expect(a.err).toEqual(["failed: the export failed (disk-full)."]);
    app.host.exportStages.push("cancelled");
    const b = fakeIo({ env: app.env });
    await runCli(["speak", "Hi.", "--out", "a.wav"], b.io);
    expect(b.err).toEqual(["failed: the export was cancelled in Speak Kit."]);
  });
  it("shows the typed refusal of the app: model_missing exits 1", async () => {
    app = await startApp();
    app.host.fault = new AutomationFault("model_missing");
    const t = fakeIo({ env: app.env });
    expect(await runCli(["speak", "Hi."], t.io)).toBe(1);
    expect(t.err).toEqual(["model_missing: The speech model is not downloaded yet."]);
  });
  it("--json also prints errors, as JSON on standard output", async () => {
    app = await startApp();
    app.host.fault = new AutomationFault("queue_full");
    const t = fakeIo({ env: app.env });
    expect(await runCli(["speak", "Hi.", "--json"], t.io)).toBe(1);
    expect(t.out).toEqual([JSON.stringify({ error: { code: "queue_full", message: "The waiting list is full. Wait for a reading to finish or clear the queue." } })]);
    expect(t.err).toEqual([]);
  });
});

describe("stop, status and queue", () => {
  it("stop empties the list unless asked to keep it", async () => {
    const a = await cli(["stop"]);
    expect(a.out).toEqual(["stopped"]);
    await cli(["stop", "--keep-queue"]);
    expect(a.host.stops).toEqual([true, false]);
  });
  it("status says what is playing, in words and in JSON", async () => {
    await cli(["speak", "Hello world."]);
    expect((await cli(["status"])).out).toEqual(["playing 1 of 1: Hello world."]);
    expect(JSON.parse((await cli(["status", "--json"])).out[0]!)).toMatchObject({ status: "playing", queued: 0 });
  });
  it("status of a quiet app is idle", async () => {
    expect((await cli(["status"])).out).toEqual(["idle"]);
  });
  it("queue lists the reading and the ones waiting", async () => {
    const r = await cli(["queue"]);
    expect(r.out).toEqual(["now: nothing", "1. next one (8 characters)"]);
  });
  it("the read-only commands take no arguments", async () => {
    for (const c of ["status", "queue", "stop", "voices", "capabilities"]) {
      const r = await cli([c, "extra"]);
      expect([c, r.code]).toEqual([c, 2]);
    }
  });
  it("lists the voices with the default marked", async () => {
    const r = await cli(["voices"]);
    expect(r.code).toBe(0);
    expect(r.out.some((l) => l.startsWith("af_heart *\t"))).toBe(true);
  });
});

describe("capabilities", () => {
  it("is the answer of the running app", async () => {
    const r = await cli(["capabilities", "--json"]);
    expect(JSON.parse(r.out[0]!)).toMatchObject({ version: "9.9.9", commands: { speak: "available", "live-stream": "parked" }, exitCodes: { ok: 0, failed: 1, usage: 2, unreachable: 3 } });
  });
  it("lists commands with their state and then the error codes", async () => {
    const r = await cli(["capabilities"]);
    expect(r.out).toContain("speak\tavailable");
    expect(r.out).toContain("live-stream\tparked");
    expect(r.out).toContain("too_large\tThe file is over the 64 MiB limit.");
  });
  it("answers from this build when the app is not running, so scripts can still read it", async () => {
    const t = fakeIo({ env: { SPEAKKIT_PORT: "1", SPEAKKIT_TOKEN: "t" } });
    expect(await runCli(["capabilities", "--json"], t.io)).toBe(0);
    expect(JSON.parse(t.out[0]!)).toMatchObject({ version: "9.9.9", commands: { speak: "available" } });
  });
});

describe("when the app cannot be reached", () => {
  it("not running: exit 3 with the code", async () => {
    const t = fakeIo({ env: { SPEAKKIT_PORT: "1", SPEAKKIT_TOKEN: "t" } });
    expect(await runCli(["status"], t.io)).toBe(3);
    expect(t.err[0]).toMatch(/^not_running: Speak Kit is not running on http:\/\/127\.0\.0\.1:1\.$/);
  });
  it("no token on this computer: exit 3", async () => {
    const t = fakeIo({ env: {} });
    expect(await runCli(["status"], t.io)).toBe(3);
    expect(t.err[0]).toContain("not_running: Speak Kit has not been started");
  });
  it("wrong token: exit 3 with token_rejected", async () => {
    app = await startApp();
    const t = fakeIo({ env: { ...app.env, SPEAKKIT_TOKEN: "wrong" } });
    expect(await runCli(["status"], t.io)).toBe(3);
    expect(t.err).toEqual(["token_rejected: The token is wrong or was regenerated."]);
  });
  it("a build without a host answers unsupported, exit 1", async () => {
    const r = await cli(["status"], {}, { noHost: true });
    expect([r.code, r.err[0]?.split(":")[0]]).toEqual([1, "unsupported"]);
  });
  it("--port and --token on the command line win over the environment", async () => {
    app = await startApp();
    const t = fakeIo({ env: { SPEAKKIT_PORT: "1", SPEAKKIT_TOKEN: "wrong" } });
    expect(await runCli(["status", "--port", String(app.server.port), "--token", app.server.token], t.io)).toBe(0);
  });
  it("a bad --port is a usage error", async () => {
    const t = fakeIo({ env: { SPEAKKIT_TOKEN: "t" } });
    expect(await runCli(["status", "--port", "70000"], t.io)).toBe(2);
  });
});

describe("usage", () => {
  it("--help prints the usage and the exit codes, exit 0", async () => {
    const t = fakeIo();
    expect(await runCli(["--help"], t.io)).toBe(0);
    expect(t.out[0]).toContain("usage: speakkit <command>");
    expect(t.out[0]).toContain("3 Speak Kit is not running or the token was rejected");
  });
  it("--version prints the version", async () => {
    const t = fakeIo();
    expect(await runCli(["--version"], t.io)).toBe(0);
    expect(t.out).toEqual(["9.9.9"]);
  });
  it("no command is a usage error that shows the usage on standard error", async () => {
    const t = fakeIo();
    expect(await runCli([], t.io)).toBe(2);
    expect(t.out).toEqual([]);
    expect(t.err[0]).toContain("usage: speakkit");
  });
  it("an unknown command or option is a usage error", async () => {
    const a = fakeIo();
    expect(await runCli(["dance"], a.io)).toBe(2);
    expect(a.err[0]).toBe('invalid_input: unknown command "dance". Run speakkit --help.');
    const b = fakeIo();
    expect(await runCli(["status", "--loud"], b.io)).toBe(2);
    expect(b.err[0]).toContain("usage: speakkit");
  });
  it("labs is explained, not run", async () => {
    const t = fakeIo();
    expect(await runCli(["labs", "list"], t.io)).toBe(1);
    expect(t.err[0]).toContain("unsupported: labs is available through the installed speakkit command");
  });
});

describe("skill", () => {
  const dir = () => path.join("C:\\Users\\me", ".claude", "skills", "speakkit", "SKILL.md");
  it("prints the skill text for this version", async () => {
    const t = fakeIo();
    await runCli(["skill"], t.io);
    expect(t.out[0]).toContain("<!-- speakkit-version: 9.9.9 -->");
  });
  it("installs it under the user's skills folder, reports it and is then current", async () => {
    const t = fakeIo();
    expect(await runCli(["skill", "install", "--json"], t.io)).toBe(0);
    expect(JSON.parse(t.out[0]!)).toEqual({ installed: dir(), version: "9.9.9" });
    expect(Object.keys(t.files)).toEqual([dir()]);
    const s = fakeIo({ files: t.files });
    await runCli(["skill", "status"], s.io);
    expect(s.out).toEqual(["up to date (9.9.9)"]);
  });
  it("status says none, and out of date with both versions", async () => {
    const a = fakeIo();
    await runCli(["skill", "status"], a.io);
    expect(a.out).toEqual(["not installed"]);
    const b = fakeIo({ files: { [dir()]: "<!-- speakkit-version: 0.5.0 -->" } });
    await runCli(["skill", "status"], b.io);
    expect(b.out).toEqual(["out of date: the skill is for 0.5.0, this app is 9.9.9"]);
  });
  it("--dir picks another skills folder", async () => {
    const t = fakeIo();
    await runCli(["skill", "install", "--dir", "elsewhere"], t.io);
    expect(Object.keys(t.files)).toEqual([path.resolve(process.cwd(), "elsewhere", "speakkit", "SKILL.md")]);
  });
  it("refuses an unknown skill command", async () => {
    const t = fakeIo();
    expect(await runCli(["skill", "remove"], t.io)).toBe(2);
  });
});

describe("path", () => {
  const launcher = (state: "installed" | "not-installed" | "broken"): Launcher => {
    const view = { state, dir: "C:\\bin", file: "C:\\bin\\speakkit.cmd", onPath: state === "installed", needsNewTerminal: false };
    return {
      inspect: async () => view,
      install: async () => ({ ...view, state: "installed", onPath: true, needsNewTerminal: true }),
      remove: async () => ({ ...view, state: "not-installed", onPath: false, needsNewTerminal: true }),
    };
  };
  it("shows the state, installs and removes", async () => {
    const a = fakeIo({ launcher: launcher("not-installed") });
    await runCli(["path"], a.io);
    expect(a.out).toEqual(["not-installed"]);
    const b = fakeIo({ launcher: launcher("not-installed") });
    await runCli(["path", "install"], b.io);
    expect(b.out).toEqual(["installed", "Open a new terminal for the change to take effect."]);
    const c = fakeIo({ launcher: launcher("installed") });
    await runCli(["path", "remove", "--json"], c.io);
    expect(JSON.parse(c.out[0]!)).toMatchObject({ state: "not-installed" });
  });
  it("is unsupported where the app did not start the tool, and refuses unknown words", async () => {
    const a = fakeIo();
    expect(await runCli(["path", "install"], a.io)).toBe(1);
    expect(a.err[0]).toContain("unsupported");
    expect(await runCli(["path", "dance"], fakeIo({ launcher: launcher("installed") }).io)).toBe(2);
  });
  it("tells a macOS user when the folder is not on the PATH", async () => {
    const l: Launcher = {
      inspect: async () => ({ state: "installed", dir: "/Users/me/.local/bin", file: "x", onPath: false, needsNewTerminal: false }),
      install: async () => null as never,
      remove: async () => null as never,
    };
    const t = fakeIo({ launcher: l });
    await runCli(["path", "status"], t.io);
    expect(t.out).toEqual(["installed", "/Users/me/.local/bin is not on your PATH yet; add it to use speakkit by name."]);
  });
});
