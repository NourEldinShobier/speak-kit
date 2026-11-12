import { PassThrough } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";
import { handleMcp, serveMcp } from "./mcp";
import { userDataDir } from "./paths";
import { parseArgs, render, runCli, type Io } from "./run";

const RUNNING: Discovery = { port: 4000, token: "t".repeat(32), pid: 1, version: "0.5.3" };

function rig(over: Partial<Io> & { reply?: Reply; running?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const sent: ControlRequest[] = [];
  let launched = 0;
  let discoveries = 0;
  const io: Io = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    discovery: async () => (discoveries++, over.running === false ? null : RUNNING),
    launch: async () => (launched++, true),
    offlineHistory: async () => null,
    post: async (_d, req) => (sent.push(req), over.reply ?? ok({})),
    stdin: async () => "from stdin",
    ...over,
  };
  return { io, out, err, sent, launched: () => launched, discoveries: () => discoveries };
}
const run = (argv: string[], r = rig()) => runCli(argv, r.io);

describe("argument parsing", () => {
  it("turns each command into one request", () => {
    expect(parseArgs(["status"]).request).toEqual({ command: "status", args: {} });
    expect(parseArgs(["read", "hello", "world"]).request).toEqual({ command: "read", args: { text: "hello world" } });
    expect(parseArgs(["voice"]).request).toEqual({ command: "voice", args: {} });
    expect(parseArgs(["voice", "bf_emma"]).request).toEqual({ command: "voice", args: { set: "bf_emma" } });
    expect(parseArgs(["dictate", "--print", "--raw"]).request).toEqual({ command: "dictate", args: { action: "start", print: true, raw: true } });
    expect(parseArgs(["dictate", "stop", "--print"]).request).toEqual({ command: "dictate", args: { action: "stop", print: true } });
    expect(parseArgs(["dictate", "cancel"]).request).toEqual({ command: "dictate", args: { action: "cancel" } });
    expect(parseArgs(["history", "--search", "hello", "--limit", "5"]).request).toEqual({ command: "history", args: { search: "hello", limit: 5 } });
    expect(parseArgs(["settings"]).request).toEqual({ command: "settings", args: {} });
    expect(parseArgs(["settings", "get", "voice"]).request).toEqual({ command: "settings", args: { get: "voice" } });
    expect(parseArgs(["settings", "set", "speed=1.5", "dictation.mode=toggle", "voice=a=b"]).request).toEqual({
      command: "settings",
      args: { set: { speed: 1.5, "dictation.mode": "toggle", voice: "a=b" } },
    });
    expect(parseArgs(["--json", "status"])).toMatchObject({ json: true });
  });

  it("says what is wrong with a command that cannot be a request", () => {
    for (const [argv, usage] of [
      [["read"], "read needs some text."],
      [["history", "--limit", "x"], "--limit takes a whole number above 0."],
      [["history", "--limit", "0"], "--limit takes a whole number above 0."],
      [["settings", "set"], "settings set needs key=value."],
      [["settings", "set", "nope"], '"nope" is not key=value.'],
      [["settings", "get"], "settings get needs a key."],
      [["dictate", "stop", "now"], 'Unexpected "stop now".'],
      [["fly"], 'Unknown command "fly".'],
      [["speak", "a.md"], "speak is not available in this version."],
    ] as const)
      expect(parseArgs(argv).usage).toBe(usage);
  });
});

describe("running a command", () => {
  it("sends the request with the discovered port and prints the reply, exit 0", async () => {
    const r = rig({ reply: ok({ voice: "af_heart" }) });
    expect(await run(["voice"], r)).toBe(0);
    expect(r.sent).toEqual([{ command: "voice", args: {} }]);
    expect(r.out.join("")).toContain("af_heart");
  });

  it("prints JSON with a version field when asked, for a success and for a failure", async () => {
    const good = rig({ reply: ok({ voice: "x" }) });
    await run(["--json", "voice"], good);
    expect(JSON.parse(good.out.join(""))).toEqual({ ok: true, version: CONTROL_VERSION, data: { voice: "x" } });
    const bad = rig({ reply: fail("refused", "No.") });
    expect(await run(["--json", "read", "hi"], bad)).toBe(1);
    expect(JSON.parse(bad.out.join(""))).toEqual({ ok: false, version: CONTROL_VERSION, error: { code: "refused", message: "No." } });
  });

  it("exits 1 for a refusal, 4 for no speech, 3 when the app does not answer, and prints the message on stderr", async () => {
    const refused = rig({ reply: fail("refused", "No.") });
    expect(await run(["read", "x"], refused)).toBe(1);
    expect(refused.err.join("")).toBe("No.\n");
    expect(await run(["dictate", "--print"], rig({ reply: fail("no-speech", "No speech was heard.") }))).toBe(4);
    expect(await run(["status"], rig({ post: async () => Promise.reject(new Error("refused")) }))).toBe(3);
  });

  it("exits 2 for wrong usage and sends nothing", async () => {
    const r = rig();
    expect(await run(["read"], r)).toBe(2);
    expect(await run(["nonsense"], r)).toBe(2);
    expect(r.sent).toEqual([]);
    expect(r.err.join("")).toContain("read needs some text.");
  });

  it("exits 3 when the app is not running, and never starts it", async () => {
    const r = rig({ running: false });
    for (const argv of [["status"], ["read", "hi"], ["pause"], ["dictate", "--print"], ["settings", "set", "speed=2"]]) expect(await run(argv, r)).toBe(3);
    expect(r.launched()).toBe(0);
    expect(r.sent).toEqual([]);
    expect(r.err.join("")).toContain("Speak Kit is not running");
  });

  it("only start launches the app, and not when it already runs", async () => {
    const stopped = rig({ running: false });
    expect(await run(["start"], stopped)).toBe(0);
    expect(stopped.launched()).toBe(1);
    const running = rig();
    expect(await run(["start"], running)).toBe(0);
    expect(running.launched()).toBe(0);
    expect(await run(["start"], rig({ running: false, launch: async () => false }))).toBe(1);
  });

  it("reads the discovery file again on every call", async () => {
    const r = rig();
    await run(["status"], r);
    await run(["status"], r);
    expect(r.discoveries()).toBe(2);
  });

  it("answers a history read from the file when the app is not running, without starting anything", async () => {
    const r = rig({ running: false, offlineHistory: async () => [{ at: 0, text: "one" }] });
    expect(await run(["history"], r)).toBe(0);
    expect(r.out.join("")).toContain("one");
    expect(r.launched()).toBe(0);
    expect(r.sent).toEqual([]);
  });

  it("reads text from stdin for a dash", async () => {
    const r = rig();
    await run(["read", "-"], r);
    expect(r.sent[0]).toEqual({ command: "read", args: { text: "from stdin" } });
  });

  it("prints the help and exits 0", async () => {
    const r = rig();
    expect(await run([], r)).toBe(0);
    expect(await run(["--help"], r)).toBe(0);
    expect(r.out.join("")).toContain("Exit codes: 0 done, 1 refused or failed, 2 usage, 3 not running, 4 no speech.");
  });

  it("dictate --print writes only the text to stdout", () => {
    expect(render(ok({ text: "hello there \n" }), { command: "dictate", args: {} }, true)).toBe("hello there");
    expect(render(ok({}), { command: "pause", args: {} }, false)).toBe("Done.");
    expect(render(ok({ entries: [] }), { command: "history", args: {} }, false)).toBe("Nothing dictated yet.");
  });
});

describe("data folder", () => {
  it("is the folder the app uses on each system, or the one a test names", () => {
    expect(userDataDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32", "C:\\Users\\a")).toMatch(/AppData.Roaming.@speakkit.desktop$/);
    expect(userDataDir({}, "win32", "C:\\Users\\a")).toMatch(/AppData.Roaming.@speakkit.desktop$/);
    expect(userDataDir({}, "darwin", "/Users/a").replaceAll("\\", "/")).toBe("/Users/a/Library/Application Support/@speakkit/desktop");
    expect(userDataDir({ SPEAKKIT_USER_DATA: "/tmp/x" }, "win32", "/h")).toBe("/tmp/x");
  });
});

describe("MCP server", () => {
  const call = async (req: ControlRequest): Promise<Reply> => (req.command === "history" ? ok({ entries: [{ text: "one" }] }) : ok({}));

  it("answers initialize and lists the three read-only tools", async () => {
    expect(await handleMcp({ id: 1, method: "initialize" }, call)).toMatchObject({ id: 1, result: { capabilities: { tools: {} }, serverInfo: { name: "speakkit" } } });
    const list = (await handleMcp({ id: 2, method: "tools/list" }, call)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["read_aloud", "history_search", "meetings_search"]);
  });

  it("runs a tool through the control commands and marks a failure as an error", async () => {
    const hist = (await handleMcp({ id: 3, method: "tools/call", params: { name: "history_search", arguments: { query: "hi", limit: 3 } } }, call)) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(hist.result.isError).toBe(false);
    expect(hist.result.content[0]!.text).toContain("one");
    const bad = (await handleMcp({ id: 4, method: "tools/call", params: { name: "read_aloud", arguments: {} } }, call)) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    const unknown = (await handleMcp({ id: 5, method: "tools/call", params: { name: "delete_everything" } }, call)) as { result: { isError: boolean } };
    expect(unknown.result.isError).toBe(true);
    const gone = (await handleMcp({ id: 6, method: "tools/call", params: { name: "meetings_search", arguments: {} } }, async () => fail("unsupported", "no"))) as { result: { isError: boolean } };
    expect(gone.result.isError).toBe(true);
  });

  it("ignores notifications and refuses an unknown method", async () => {
    expect(await handleMcp({ method: "notifications/initialized" }, call)).toBeNull();
    expect(await handleMcp({ id: 7, method: "nope" }, call)).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcp({ id: 8, method: "ping" }, call)).toMatchObject({ result: {} });
  });

  it("serves one message per line and survives a line that is not JSON", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
    const done = serveMcp(input, output, call);
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    input.write("garbage\n\n");
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.end();
    await done;
    await new Promise((r) => setImmediate(r));
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
    ]);
  });
});
