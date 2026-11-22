import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { CONTROL_VERSION, fail, type ControlRequest, type Reply } from "../shared/control/contract";
import { MCP_TOOLS, toolOn } from "../shared/control/mcp-tools";

/** What the bridge needs besides the app: the person's tool switches. They are read on every call, so a switch takes effect at once. */
export interface McpContext {
  /** One command to the running app. */
  call(req: ControlRequest): Promise<Reply>;
  flags(): Promise<Record<string, boolean>>;
}

interface Message {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const limit = { type: "integer", minimum: 1, maximum: 200 };

const SCHEMAS: Record<string, object> = {
  read_aloud: obj({ text: { type: "string", description: "The text to read." }, queue: { type: "boolean", description: "Wait behind what is playing instead of replacing it." } }, ["text"]),
  stop_reading: obj({ keepQueue: { type: "boolean", description: "Start the next waiting reading instead of clearing the list." } }),
  reading_queue: obj({}),
  history_search: obj({ query: { type: "string" }, limit }),
};

/** The tool switches from the settings file. With the control server off nothing is offered: the master switch covers the app. */
export function mcpFlags(config: unknown): Record<string, boolean> {
  const c = (config ?? {}) as { controlServer?: unknown; mcpTools?: unknown };
  if (c.controlServer === false) return Object.fromEntries(MCP_TOOLS.map((t) => [t.name, false]));
  return c.mcpTools && typeof c.mcpTools === "object" ? (c.mcpTools as Record<string, boolean>) : {};
}

const tools = (flags: Record<string, boolean>) => MCP_TOOLS.filter((t) => toolOn(flags, t.name)).map((t) => ({ name: t.name, description: t.description, inputSchema: SCHEMAS[t.name] }));

const asText = (r: { ok: boolean; text: string }) => ({ isError: !r.ok, content: [{ type: "text", text: r.text }] });
const content = (r: Reply) => asText({ ok: r.ok, text: r.ok ? JSON.stringify(r.data) : r.error.message });

type Args = Record<string, unknown>;
type Built = { app: ControlRequest } | string;

const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
const lim = (a: Args) => (typeof a.limit === "number" ? { limit: a.limit } : {});

/** The app request each tool call stands for, or the text of what is wrong with its arguments. */
const BUILD: Record<string, (a: Args) => Built> = {
  read_aloud: (a) => (str(a, "text") ? { app: { command: "speak", args: { text: a.text, ...(a.queue === true && { queue: true }) } } } : "read_aloud needs text."),
  stop_reading: (a) => ({ app: { command: "stop", args: a.keepQueue === true ? { keepQueue: true } : {} } }),
  reading_queue: () => ({ app: { command: "queue", args: {} } }),
  history_search: (a) => ({ app: { command: "history", args: { ...(str(a, "query") && { search: str(a, "query") }), ...lim(a) } } }),
};

async function callTool(name: string, args: Args, ctx: McpContext) {
  if (MCP_TOOLS.some((t) => t.name === name) && !toolOn(await ctx.flags(), name))
    return asText({ ok: false, text: `The tool ${name} is turned off. Turn it on in Speak Kit under Settings, Automation.` });
  const req = Object.hasOwn(BUILD, name) ? BUILD[name]!(args) : undefined;
  if (req === undefined) return content(fail("usage", `Unknown tool ${name}.`));
  if (typeof req === "string") return content(fail("usage", req));
  return content(await ctx.call(req.app));
}

/** One JSON-RPC message of the Model Context Protocol, answered; null for a notification. Local, one machine, the same token rules as the command line (app calls go through it). */
export async function handleMcp(msg: Message, ctx: McpContext): Promise<object | null> {
  if (msg.id === undefined || msg.id === null) return null;
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: String(CONTROL_VERSION) } });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: tools(await ctx.flags()) });
    case "tools/call":
      return reply(await callTool(msg.params?.name ?? "", msg.params?.arguments ?? {}, ctx));
    default:
      return error(-32601, "Method not found");
  }
}

/** Reads one JSON message per line from `input` and writes the answers to `output`. Resolves when the input ends. */
export async function serveMcp(input: Readable, output: Writable, ctx: McpContext): Promise<void> {
  for await (const line of createInterface({ input })) {
    if (!line.trim()) continue;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    let answer: object | null;
    try {
      answer = await handleMcp(msg, ctx);
    } catch {
      // One failed call must not end the server: the AI app would lose the connection.
      answer = msg.id === undefined || msg.id === null ? null : { jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "Speak Kit could not answer that request." } };
    }
    if (answer) output.write(`${JSON.stringify(answer)}\n`);
  }
}
