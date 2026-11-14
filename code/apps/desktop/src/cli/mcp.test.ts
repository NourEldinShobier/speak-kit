import { PassThrough } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import { MCP_TOOLS, toolOn } from "../shared/control/mcp-tools";
import { parseConfig } from "../shared/schemas";
import { handleMcp, mcpFlags, serveMcp, type McpContext } from "./mcp";
import type { ReadRequest } from "./reads";

const rig = (flags: Record<string, boolean> = {}) => {
  const app: ControlRequest[] = [];
  const reads: ReadRequest[] = [];
  const call = async (r: ControlRequest): Promise<Reply> => (app.push(r), ok({ done: r.command }));
  const ctx: McpContext = {
    call,
    read: async (r) => (reads.push(r), r.ref === "nope" ? { ok: false, code: "failed", message: "No meeting." } : { ok: true, data: { read: r.action }, text: "" }),
    flags: async () => flags,
  };
  return { app, reads, call, ctx };
};
type Result = { result: { isError: boolean; content: { text: string }[]; tools: { name: string }[] } };
const tool = (r: ReturnType<typeof rig>, name: string, args: object = {}) =>
  handleMcp({ id: 1, method: "tools/call", params: { name, arguments: args as Record<string, unknown> } }, r.ctx) as Promise<Result>;

describe("the master switch", () => {
  it("offers no tool, not even a switched-on one, while the control server is off", () => {
    const stored = { controlServer: false, mcpTools: { history_search: true, meetings_list: true } };
    const flags = mcpFlags(stored);
    expect(MCP_TOOLS.filter((t) => toolOn(flags, t.name))).toEqual([]);
    expect(MCP_TOOLS.filter((t) => toolOn(mcpFlags({ ...stored, controlServer: true }), t.name)).map((t) => t.name)).toEqual([
      "read_aloud",
      "stop_reading",
      "reading_queue",
      "history_search",
      "meetings_list",
    ]);
  });
  it("uses the stored switches, and the defaults for a missing or damaged settings file", () => {
    expect(mcpFlags({ mcpTools: { read_aloud: false } })).toEqual({ read_aloud: false });
    expect(mcpFlags(undefined)).toEqual({});
    expect(mcpFlags({ mcpTools: "yes" })).toEqual({});
  });
  it("refuses a tool call while it is off, without reading any file", async () => {
    const r = rig(mcpFlags({ controlServer: false, mcpTools: { meetings_list: true } }));
    const res = await tool(r, "meetings_list");
    expect(res.result.isError).toBe(true);
    expect(r.reads).toEqual([]);
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
      ["meetings_list", "List meetings", "Your data", true],
      ["meetings_search", "Search meetings", "Your data", true],
      ["meetings_show", "Read a meeting", "Your data", true],
      ["capture_list", "List captures", "Your data", true],
      ["capture_show", "Read a capture", "Your data", true],
    ]);
    expect(MCP_TOOLS.map((t) => t.description)).toEqual([
      "Read text aloud, now or after what is playing.",
      "Stop the reading and clear the waiting list, or keep it.",
      "See what is playing and what waits.",
      "Search what was dictated. Read only.",
      "List recorded meetings. Read only.",
      "Search meeting titles, summaries and transcripts. Read only.",
      "Read one meeting, or a time range or chapter of it. Read only.",
      "List saved captures. Read only.",
      "Read what was said in one capture. Read only.",
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
    expect(await names({ meetings_show: true, read_aloud: false })).toEqual(["stop_reading", "reading_queue", "meetings_show"]);
  });

  it("describes a tool with its schema", async () => {
    const r = rig({ meetings_show: true });
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; description: string; inputSchema: object }[] } };
    expect(list.result.tools.find((t) => t.name === "meetings_show")).toMatchObject({
      description: "Read one meeting, or a time range or chapter of it. Read only.",
      inputSchema: { required: ["id"], additionalProperties: false, properties: { chapter: { type: "integer", minimum: 1 } } },
    });
  });

  it("describes every argument of every tool", async () => {
    const r = rig(Object.fromEntries(MCP_TOOLS.map((t) => [t.name, true])));
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; inputSchema: object }[] } };
    const limit = { type: "integer", minimum: 1, maximum: 200 };
    const when = { description: "Seconds, m:ss or h:mm:ss.", oneOf: [{ type: "string" }, { type: "number" }] };
    const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
    expect(Object.fromEntries(list.result.tools.map((t) => [t.name, t.inputSchema]))).toEqual({
      read_aloud: obj({ text: { type: "string", description: "The text to read." }, queue: { type: "boolean", description: "Wait behind what is playing instead of replacing it." } }, ["text"]),
      stop_reading: obj({ keepQueue: { type: "boolean", description: "Start the next waiting reading instead of clearing the list." } }),
      reading_queue: obj({}),
      history_search: obj({ query: { type: "string" }, limit }),
      meetings_list: obj({ limit }),
      meetings_search: obj({ query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, ["query"]),
      meetings_show: obj({ id: { type: "string", description: "An id, 6 or more characters of one, or latest." }, from: when, to: when, chapter: { type: "integer", minimum: 1 } }, ["id"]),
      capture_list: obj({ limit }),
      capture_show: obj({ id: { type: "string", description: "An id, a title or latest." } }, ["id"]),
    });
  });

  it("passes a zero start and nothing else through, and refuses a time that is neither text nor a number", async () => {
    const r = rig({ meetings_show: true });
    await tool(r, "meetings_show", { id: "x", from: 0 });
    await tool(r, "meetings_show", { id: "x" });
    expect(r.reads).toEqual([
      { command: "meetings", action: "show", ref: "x", from: 0 },
      { command: "meetings", action: "show", ref: "x" },
    ]);
    expect((await tool(r, "meetings_show", { id: "x", to: true })).result.content[0]!.text).toBe("from and to take seconds, m:ss or h:mm:ss.");
    expect((await tool(r, "meetings_show", { id: "x", from: "1:99" })).result.isError).toBe(true);
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

  it("answers the file tools from the files, with times as clocks or seconds", async () => {
    const r = rig({ meetings_list: true, meetings_search: true, meetings_show: true, capture_list: true, capture_show: true });
    await tool(r, "meetings_list", { limit: 3 });
    await tool(r, "meetings_search", { query: "budget", limit: 5 });
    await tool(r, "meetings_show", { id: "latest", from: "1:30", to: 200, chapter: 2 });
    await tool(r, "capture_list");
    await tool(r, "capture_show", { id: "latest" });
    expect(r.app).toEqual([]);
    expect(r.reads).toEqual([
      { command: "meetings", action: "list", limit: 3 },
      { command: "meetings", action: "search", query: "budget", limit: 5 },
      { command: "meetings", action: "show", ref: "latest", from: 90, to: 200, chapter: 2 },
      { command: "capture", action: "list" },
      { command: "capture", action: "show", ref: "latest" },
    ]);
  });

  it("refuses a tool that is off and does not run it", async () => {
    const r = rig();
    const res = await tool(r, "meetings_list");
    expect(res.result).toEqual({ isError: true, content: [{ type: "text", text: "The tool meetings_list is turned off. Turn it on in Speak Kit under Settings, Automation." }] });
    expect(r.reads).toEqual([]);
    expect((await tool(rig({ read_aloud: false }), "read_aloud", { text: "x" })).result.isError).toBe(true);
  });

  it("returns data as text and a failure as an error", async () => {
    const r = rig({ meetings_show: true });
    expect((await tool(r, "reading_queue")).result).toEqual({ isError: false, content: [{ type: "text", text: '{"done":"queue"}' }] });
    expect((await tool(r, "meetings_show", { id: "nope" })).result).toEqual({ isError: true, content: [{ type: "text", text: "No meeting." }] });
    const refused = (await handleMcp({ id: 3, method: "tools/call", params: { name: "read_aloud", arguments: { text: "x" } } }, { ...r.ctx, call: async () => fail("busy", "Busy.") })) as Result;
    expect(refused.result).toEqual({ isError: true, content: [{ type: "text", text: "Busy." }] });
  });

  it("says what is wrong with arguments and with an unknown tool", async () => {
    const r = rig({ meetings_show: true, meetings_search: true, capture_show: true });
    const text = async (name: string, args: object) => (await tool(r, name, args)).result.content[0]!.text;
    expect(await text("read_aloud", { text: "  " })).toBe("read_aloud needs text.");
    expect(await text("meetings_search", {})).toBe("meetings_search needs a query.");
    expect(await text("meetings_show", {})).toBe("meetings_show needs an id.");
    expect(await text("meetings_show", { id: "x", from: "soon" })).toBe("from and to take seconds, m:ss or h:mm:ss.");
    expect(await text("meetings_show", { id: "x", to: -1 })).toBe("from and to take seconds, m:ss or h:mm:ss.");
    expect(await text("capture_show", {})).toBe("capture_show needs an id.");
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
    const r = rig({ meetings_list: true });
    r.ctx.read = async () => {
      throw new Error("EISDIR");
    };
    const [input, output] = [new PassThrough(), new PassThrough()];
    const lines: string[] = [];
    output.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
    const done = serveMcp(input, output, r.ctx);
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"meetings_list","arguments":{}}}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
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
    const r = rig({ meetings_list: false });
    const out = await tool(r, name, { read: { command: "meetings", action: "list" }, app: { command: "history", args: {} } });
    expect(out.result.isError).toBe(true);
    expect(r.reads).toEqual([]);
    expect(r.app).toEqual([]);
  });
});
