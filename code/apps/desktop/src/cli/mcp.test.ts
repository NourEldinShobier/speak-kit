import { PassThrough } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import { MCP_TOOLS, toolOn } from "../shared/control/mcp-tools";
import { parseConfig } from "../shared/schemas";
import { handleMcp, mcpFlags, serveMcp, type McpContext } from "./mcp";

const rig = (flags: Record<string, boolean> = {}) => {
  const app: ControlRequest[] = [];
  const call = async (r: ControlRequest): Promise<Reply> => (app.push(r), ok({ done: r.command }));
  const ctx: McpContext = { call, flags: async () => flags };
  return { app, call, ctx };
};
type Result = { result: { isError: boolean; content: { text: string }[]; tools: { name: string }[] } };
const tool = (r: ReturnType<typeof rig>, name: string, args: object = {}) =>
  handleMcp({ id: 1, method: "tools/call", params: { name, arguments: args as Record<string, unknown> } }, r.ctx) as Promise<Result>;

describe("the master switch", () => {
  it("offers no tool, not even a switched-on one, while the control server is off", () => {
    const stored = { controlServer: false, mcpTools: { history_search: true } };
    const flags = mcpFlags(stored);
    expect(MCP_TOOLS.filter((t) => toolOn(flags, t.name))).toEqual([]);
    expect(MCP_TOOLS.filter((t) => toolOn(mcpFlags({ ...stored, controlServer: true }), t.name)).map((t) => t.name)).toEqual(["read_aloud", "stop_reading", "reading_queue", "history_search"]);
  });
  it("uses the stored switches, and the defaults for a missing or damaged settings file", () => {
    expect(mcpFlags({ mcpTools: { read_aloud: false } })).toEqual({ read_aloud: false });
    expect(mcpFlags(undefined)).toEqual({});
    expect(mcpFlags({ mcpTools: "yes" })).toEqual({});
  });
  it("refuses a tool call while it is off, without calling the app", async () => {
    const r = rig(mcpFlags({ controlServer: false, mcpTools: { history_search: true } }));
    const res = await tool(r, "history_search");
    expect(res.result.isError).toBe(true);
    expect(r.app).toEqual([]);
  });
});

describe("which tools are on", () => {
  it("reading tools are on by default and the ones that read your own words are off", () => {
    expect(MCP_TOOLS.filter((t) => toolOn({}, t.name)).map((t) => t.name)).toEqual(["read_aloud", "stop_reading", "reading_queue"]);
    expect(toolOn({ history_search: true }, "history_search")).toBe(true);
    expect(toolOn({ read_aloud: false }, "read_aloud")).toBe(false);
    expect(toolOn({ nope: true }, "nope")).toBe(false);
  });
  it("names each tool, its group and whether it reads your own words", () => {
    expect(MCP_TOOLS.map((t) => [t.name, t.title, t.group, t.private])).toEqual([
      ["read_aloud", "Read aloud", "Reading", false],
      ["stop_reading", "Stop reading", "Reading", false],
      ["reading_queue", "Reading queue", "Reading", false],
      ["history_search", "Search dictation history", "Your data", true],
    ]);
    expect(MCP_TOOLS.map((t) => t.description)).toEqual([
      "Read text aloud, now or after what is playing.",
      "Stop the reading and clear the waiting list, or keep it.",
      "See what is playing and what waits.",
      "Search what was dictated. Read only.",
    ]);
  });
  it("the setting has a default, survives a file that lacks it and ignores wrong types", () => {
    expect(parseConfig({}).mcpTools).toEqual({});
    expect(parseConfig({ voice: "x" }).mcpTools).toEqual({});
    expect(parseConfig({ mcpTools: { history_search: true } }).mcpTools).toEqual({ history_search: true });
    expect(parseConfig({ mcpTools: "yes" }).mcpTools).toEqual({});
    expect(parseConfig({ mcpTools: { a: "yes" } }).mcpTools).toEqual({});
  });
});

describe("MCP server", () => {
  it("describes the server and lists only the tools that are on", async () => {
    const r = rig();
    expect(await handleMcp({ id: 1, method: "initialize" }, r.ctx)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: String(CONTROL_VERSION) } },
    });
    const names = async (flags: Record<string, boolean>) => ((await handleMcp({ id: 2, method: "tools/list" }, { ...r.ctx, flags: async () => flags })) as Result).result.tools.map((t) => t.name);
    expect(await names({})).toEqual(["read_aloud", "stop_reading", "reading_queue"]);
    expect(await names({ history_search: true, read_aloud: false })).toEqual(["stop_reading", "reading_queue", "history_search"]);
  });

  it("describes a tool with its schema", async () => {
    const r = rig({ history_search: true });
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; description: string; inputSchema: object }[] } };
    expect(list.result.tools.find((t) => t.name === "history_search")).toMatchObject({
      description: "Search what was dictated. Read only.",
      inputSchema: { required: [], additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 200 } } },
    });
  });

  it("describes every argument of every tool", async () => {
    const r = rig(Object.fromEntries(MCP_TOOLS.map((t) => [t.name, true])));
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; inputSchema: object }[] } };
    const limit = { type: "integer", minimum: 1, maximum: 200 };
    const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
    expect(Object.fromEntries(list.result.tools.map((t) => [t.name, t.inputSchema]))).toEqual({
      read_aloud: obj({ text: { type: "string", description: "The text to read." }, queue: { type: "boolean", description: "Wait behind what is playing instead of replacing it." } }, ["text"]),
      stop_reading: obj({ keepQueue: { type: "boolean", description: "Start the next waiting reading instead of clearing the list." } }),
      reading_queue: obj({}),
      history_search: obj({ query: { type: "string" }, limit }),
    });
  });

  it("sends each app tool to the right command", async () => {
    const r = rig({ history_search: true });
    await tool(r, "read_aloud", { text: "hi" });
    await tool(r, "read_aloud", { text: "later", queue: true });
    await tool(r, "stop_reading", { keepQueue: true });
    await tool(r, "stop_reading");
    await tool(r, "reading_queue");
    await tool(r, "history_search", { query: "x", limit: 4 });
    await tool(r, "history_search");
    expect(r.app).toEqual([
      { command: "speak", args: { text: "hi" } },
      { command: "speak", args: { text: "later", queue: true } },
      { command: "stop", args: { keepQueue: true } },
      { command: "stop", args: {} },
      { command: "queue", args: {} },
      { command: "history", args: { search: "x", limit: 4 } },
      { command: "history", args: {} },
    ]);
  });

  it("refuses a tool that is off and does not run it", async () => {
    const r = rig();
    const res = await tool(r, "history_search");
    expect(res.result).toEqual({ isError: true, content: [{ type: "text", text: "The tool history_search is turned off. Turn it on in Speak Kit under Settings, Automation." }] });
    expect(r.app).toEqual([]);
    expect((await tool(rig({ read_aloud: false }), "read_aloud", { text: "x" })).result.isError).toBe(true);
  });

  it("returns data as text and a failure as an error", async () => {
    const r = rig();
    expect((await tool(r, "reading_queue")).result).toEqual({ isError: false, content: [{ type: "text", text: '{"done":"queue"}' }] });
    const refused = (await handleMcp({ id: 3, method: "tools/call", params: { name: "read_aloud", arguments: { text: "x" } } }, { ...r.ctx, call: async () => fail("busy", "Busy.") })) as Result;
    expect(refused.result).toEqual({ isError: true, content: [{ type: "text", text: "Busy." }] });
  });

  it("says what is wrong with arguments and with an unknown tool", async () => {
    const r = rig();
    const text = async (name: string, args: object) => (await tool(r, name, args)).result.content[0]!.text;
    expect(await text("read_aloud", { text: "  " })).toBe("read_aloud needs text.");
    expect(await text("delete_everything", {})).toBe("Unknown tool delete_everything.");
  });

  it("ignores notifications and refuses an unknown method", async () => {
    const r = rig();
    expect(await handleMcp({ method: "notifications/initialized" }, r.ctx)).toBeNull();
    expect(await handleMcp({ id: 7, method: "nope" }, r.ctx)).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found" } });
    expect(await handleMcp({ id: null, method: "ping" }, r.ctx)).toBeNull();
    expect(await handleMcp({ id: 0, method: "tools/call" }, r.ctx)).toMatchObject({ result: { isError: true, content: [{ text: "Unknown tool ." }] } });
    expect(await handleMcp({ id: 8, method: "ping" }, r.ctx)).toMatchObject({ result: {} });
  });

  it("serves one message per line and survives a line that is not JSON", async () => {
    const r = rig();
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
    const done = serveMcp(input, output, r.ctx);
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\nnot json\n   \n\n{"method":"notifications/initialized"}\n');
    input.end();
    await done;
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
    ]);
  });
  it("answers a call that throws with an error and keeps serving the next request", async () => {
    const r = rig({ history_search: true });
    r.ctx.call = async () => {
      throw new Error("ECONNRESET");
    };
    const [input, output] = [new PassThrough(), new PassThrough()];
    const lines: string[] = [];
    output.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
    const done = serveMcp(input, output, r.ctx);
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"history_search","arguments":{}}}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    input.end();
    await done;
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Speak Kit could not answer that request." } },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });
});

describe("inherited names", () => {
  it.each(["constructor", "valueOf", "toString", "__proto__"])("refuses %s as a tool and runs nothing", async (name) => {
    const r = rig({ history_search: false });
    const out = await tool(r, name, { app: { command: "history", args: {} } });
    expect(out.result.isError).toBe(true);
    expect(r.app).toEqual([]);
  });
});
