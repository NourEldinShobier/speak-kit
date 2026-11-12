import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";
import { parseArgs, render, runCli, type Io } from "./run";

const RUNNING: Discovery = { port: 4000, token: "t".repeat(32), pid: 1, version: "0.5.3" };

function rig(over: Partial<Io> & { reply?: Reply; running?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    discovery: async () => (over.running === false ? null : RUNNING),
    launch: async () => true,
    offlineHistory: async () => null,
    post: async () => over.reply ?? ok({}),
    stdin: async () => "",
    reads: { meetings: async () => ({ entries: [], transcript: async () => [], notes: async () => [] }), captures: async () => ({ records: [], root: "" }) },
    readConfig: async () => undefined,
    file: async () => ({ kind: "none" }),
    sleep: async () => {},
    ...over,
  };
  return { io, out, err };
}
const run = (argv: string[], r = rig()) => runCli(argv, r.io);

describe("command line output details", () => {
  it("lists every command in the help", async () => {
    const r = rig();
    await run(["--help"], r);
    const text = r.out.join("");
    for (const line of [
      "start",
      "status",
      "read <text | ->",
      "pause | resume",
      "stop [--keep-queue]",
      "speak <text | file | ->",
      "queue",
      "meetings list",
      "capture list",
      "labs [list]",
      "voice [id]",
      "dictate [--print] [--raw]",
      "dictate stop [--print]",
      "dictate cancel",
      "settings [get <key> | set <key>=<json> ...]",
      "history [--search words] [--limit n]",
      "capabilities",
      "skill",
    ])
      expect(text).toContain(line);
    expect(text.startsWith("Usage: speakkit [--json] <command>")).toBe(true);
  });

  it("prints history one line per entry with the time, and settings and status as indented JSON", () => {
    const history = render(ok({ entries: [{ at: Date.UTC(2026, 0, 2, 3, 4, 5), text: " hello \n" }] }), { command: "history", args: {} }, false);
    expect(history).toBe("2026-01-02T03:04:05.000Z  hello");
    expect(render(ok({ settings: { a: 1 } }), { command: "settings", args: {} }, false)).toBe('{\n  "a": 1\n}');
    expect(render(ok({ key: "speed", value: 2 }), { command: "settings", args: {} }, false)).toBe('{\n  "key": "speed",\n  "value": 2\n}');
    expect(render(ok({ app: "1" }), { command: "status", args: {} }, false)).toBe('{\n  "app": "1"\n}');
    expect(render(ok({ voice: "x" }), { command: "voice", args: {} }, false)).toBe('{"voice":"x"}');
    expect(render(fail("busy", "A dictation is already running."), { command: "dictate", args: {} }, false)).toBe("A dictation is already running.");
    expect(render(ok({ text: "skill text\n\n" }), { command: "skill", args: {} }, false)).toBe("skill text");
  });

  it("writes a failure to stderr as text and to stdout as JSON, and success to stdout", async () => {
    const text = rig({ reply: fail("busy", "Busy.") });
    await run(["dictate"], text);
    expect([text.out.join(""), text.err.join("")]).toEqual(["", "Busy.\n"]);
    const done = rig({ reply: ok({}) });
    await run(["pause"], done);
    expect([done.out.join(""), done.err.join("")]).toEqual(["Done.\n", ""]);
    const usage = rig();
    await run(["--json", "nonsense"], usage);
    expect(JSON.parse(usage.err.join(""))).toEqual({ ok: false, version: CONTROL_VERSION, error: { code: "usage", message: 'Unknown command "nonsense".' } });
  });

  it("gives a dictate a wait long enough for a person to speak, and everything else the short limit", async () => {
    const waits: number[] = [];
    const r = rig({ post: async (_d, _q, ms) => (waits.push(ms), ok({})) });
    await run(["dictate", "--print"], r);
    await run(["status"], r);
    expect(waits).toEqual([305_000, 10_000]);
  });

  it("says the app did not answer when the reply cannot be read", async () => {
    const r = rig({ post: async () => Promise.reject(new Error("socket")) });
    expect(await run(["--json", "status"], r)).toBe(3);
    expect(JSON.parse(r.out.join(""))).toMatchObject({ error: { code: "not-running", message: "Speak Kit did not answer. It may have quit." } });
  });

  it("the start command says whether the app could be started", async () => {
    const started = rig({ running: false });
    await run(["--json", "start"], started);
    expect(JSON.parse(started.out.join(""))).toEqual({ ok: true, version: CONTROL_VERSION, data: { running: true } });
    const bad = rig({ running: false, launch: async () => false });
    await run(["--json", "start"], bad);
    expect(JSON.parse(bad.out.join(""))).toMatchObject({ ok: false, error: { code: "failed", message: "Speak Kit could not be started." } });
  });

  it("parses flags in any position and treats -h as help", () => {
    expect(parseArgs(["status", "--json"]).json).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["history", "--limit", "3", "--search", "a b"]).request).toEqual({ command: "history", args: { search: "a b", limit: 3 } });
    expect(parseArgs(["dictate", "--raw"]).request).toEqual({ command: "dictate", args: { action: "start", raw: true } });
    expect(parseArgs(["settings", "set", 'dictation.replacements=[{"from":"a","to":"b"}]']).request).toEqual({
      command: "settings",
      args: { set: { "dictation.replacements": [{ from: "a", to: "b" }] } },
    });
  });
});
