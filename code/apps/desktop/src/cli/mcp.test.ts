import { PassThrough } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { CONTROL_VERSION, fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import { MCP_TOOLS } from "../shared/control/mcp-tools";
import { handleMcp, serveMcp, type McpContext } from "./mcp";

const rig = () => {
  const app: ControlRequest[] = [];
  const call = async (r: ControlRequest): Promise<Reply> => (app.push(r), ok({ done: r.command }));
  const ctx: McpContext = { call };
  return { app, call, ctx };
};
type Result = { result: { isError: boolean; content: { text: string }[]; tools: { name: string }[] } };
const tool = (r: ReturnType<typeof rig>, name: string, args: object = {}) =>
  handleMcp({ id: 1, method: "tools/call", params: { name, arguments: args as Record<string, unknown> } }, r.ctx) as Promise<Result>;

describe("which tools are offered", () => {
  it("names each tool and what it does, and offers nothing that reads your own words", () => {
    expect(MCP_TOOLS).toEqual([
      { name: "read_aloud", description: "Read text aloud, now or after what is playing." },
      { name: "stop_reading", description: "Stop the reading and clear the waiting list, or keep it." },
      { name: "reading_queue", description: "See what is playing and what waits." },
    ]);
  });
});

describe("MCP server", () => {
  it("describes the server and lists its tools", async () => {
    const r = rig();
    expect(await handleMcp({ id: 1, method: "initialize" }, r.ctx)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: String(CONTROL_VERSION) } },
    });
    expect(((await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as Result).result.tools.map((t) => t.name)).toEqual(["read_aloud", "stop_reading", "reading_queue"]);
  });

  it("describes a tool with its schema", async () => {
    const r = rig();
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; description: string; inputSchema: object }[] } };
    expect(list.result.tools.find((t) => t.name === "reading_queue")).toEqual({
      name: "reading_queue",
      description: "See what is playing and what waits.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    });
  });

  it("describes every argument of every tool", async () => {
    const r = rig();
    const list = (await handleMcp({ id: 2, method: "tools/list" }, r.ctx)) as { result: { tools: { name: string; inputSchema: object }[] } };
    const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
    expect(Object.fromEntries(list.result.tools.map((t) => [t.name, t.inputSchema]))).toEqual({
      read_aloud: obj({ text: { type: "string", description: "The text to read." }, queue: { type: "boolean", description: "Wait behind what is playing instead of replacing it." } }, ["text"]),
      stop_reading: obj({ keepQueue: { type: "boolean", description: "Start the next waiting reading instead of clearing the list." } }),
      reading_queue: obj({}),
    });
  });

  it("sends each app tool to the right command", async () => {
    const r = rig();
    await tool(r, "read_aloud", { text: "hi" });
    await tool(r, "read_aloud", { text: "later", queue: true });
    await tool(r, "stop_reading", { keepQueue: true });
    await tool(r, "stop_reading");
    await tool(r, "reading_queue");
    expect(r.app).toEqual([
      { command: "speak", args: { text: "hi" } },
      { command: "speak", args: { text: "later", queue: true } },
      { command: "stop", args: { keepQueue: true } },
      { command: "stop", args: {} },
      { command: "queue", args: {} },
    ]);
  });

  it("refuses the dictation history tool, which is not offered, and does not run it", async () => {
    const r = rig();
    const res = await tool(r, "history_search");
    expect(res.result).toEqual({ isError: true, content: [{ type: "text", text: "Unknown tool history_search." }] });
    expect(r.app).toEqual([]);
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
    const r = rig();
    r.ctx.call = async () => {
      throw new Error("ECONNRESET");
    };
    const [input, output] = [new PassThrough(), new PassThrough()];
    const lines: string[] = [];
    output.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
    const done = serveMcp(input, output, r.ctx);
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reading_queue","arguments":{}}}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
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
    const r = rig();
    const out = await tool(r, name, { app: { command: "history", args: {} } });
    expect(out.result.isError).toBe(true);
    expect(r.app).toEqual([]);
  });
});
