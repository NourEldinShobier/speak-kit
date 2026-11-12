import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";
import { handleMcp } from "./mcp";
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
    ...over,
  };
  return { io, out, err };
}
const run = (argv: string[], r = rig()) => runCli(argv, r.io);

describe("MCP details", () => {
  const none = async (): Promise<Reply> => ok({});

  it("describes the server and every tool exactly", async () => {
    expect(await handleMcp({ id: 1, method: "initialize" }, none)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: String(CONTROL_VERSION) } },
    });
    const list = (await handleMcp({ id: 2, method: "tools/list" }, none)) as { result: { tools: object[] } };
    const [read, history, meetings] = list.result.tools;
    expect(read).toMatchObject({ name: "read_aloud", description: "Read text aloud with Speak Kit on this computer.", inputSchema: { required: ["text"], properties: { text: { type: "string" } } } });
    expect(history).toMatchObject({
      name: "history_search",
      description: "Search what was dictated with Speak Kit. Read only.",
      inputSchema: { properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } } },
    });
    expect(meetings).toMatchObject({ name: "meetings_search", description: "Search meeting transcripts. Read only. Not available in this version." });
  });

  it("sends each tool to the right command with the right arguments", async () => {
    const seen: ControlRequest[] = [];
    const call = async (r: ControlRequest) => (seen.push(r), ok({}));
    await handleMcp({ id: 1, method: "tools/call", params: { name: "read_aloud", arguments: { text: "hi" } } }, call);
    await handleMcp({ id: 2, method: "tools/call", params: { name: "history_search", arguments: { query: "x", limit: 4 } } }, call);
    await handleMcp({ id: 3, method: "tools/call", params: { name: "history_search", arguments: {} } }, call);
    await handleMcp({ id: 4, method: "tools/call", params: { name: "meetings_search", arguments: { query: "q" } } }, call);
    expect(seen).toEqual([
      { command: "read", args: { text: "hi" } },
      { command: "history", args: { search: "x", limit: 4 } },
      { command: "history", args: {} },
      { command: "meetings", args: {} },
    ]);
  });

  it("returns the data as text, and the message of a failure", async () => {
    const good = (await handleMcp({ id: 1, method: "tools/call", params: { name: "history_search", arguments: {} } }, async () => ok({ entries: [] }))) as { result: object };
    expect(good.result).toEqual({ isError: false, content: [{ type: "text", text: '{"entries":[]}' }] });
    const bad = (await handleMcp({ id: 2, method: "tools/call", params: { name: "read_aloud", arguments: { text: "  " } } }, none)) as { result: object };
    expect(bad.result).toEqual({ isError: true, content: [{ type: "text", text: "read_aloud needs text." }] });
    const unknown = (await handleMcp({ id: 3, method: "tools/call", params: { name: "zip" } }, none)) as { result: object };
    expect(unknown.result).toEqual({ isError: true, content: [{ type: "text", text: "Unknown tool zip." }] });
    expect(await handleMcp({ id: 0, method: "ping" }, none)).toEqual({ jsonrpc: "2.0", id: 0, result: {} });
    expect(await handleMcp({ id: null, method: "ping" }, none)).toBeNull();
    expect(await handleMcp({ id: 9, method: "nope" }, none)).toEqual({ jsonrpc: "2.0", id: 9, error: { code: -32601, message: "Method not found" } });
  });
});

describe("command line output details", () => {
  it("lists every command in the help", async () => {
    const r = rig();
    await run(["--help"], r);
    const text = r.out.join("");
    for (const line of [
      "start",
      "status",
      "read <text | ->",
      "pause | resume | stop",
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
