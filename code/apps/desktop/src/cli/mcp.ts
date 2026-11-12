import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { CONTROL_VERSION, fail, type ControlRequest, type Reply } from "../shared/control/contract";

type Call = (req: ControlRequest) => Promise<Reply>;

interface Message {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

const TOOLS = [
  {
    name: "read_aloud",
    description: "Read text aloud with Speak Kit on this computer.",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "The text to read." } }, required: ["text"], additionalProperties: false },
  },
  {
    name: "history_search",
    description: "Search what was dictated with Speak Kit. Read only.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false },
  },
  {
    name: "meetings_search",
    description: "Search meeting transcripts. Read only. Not available in this version.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false },
  },
] as const;

const content = (r: Reply) => ({
  isError: !r.ok,
  content: [{ type: "text", text: r.ok ? JSON.stringify(r.data) : r.error.message }],
});

/** The request a tool call stands for, or an error text when the arguments are wrong. */
function requestFor(name: string, args: Record<string, unknown>): ControlRequest | string {
  if (name === "read_aloud") return typeof args.text === "string" && args.text.trim() ? { command: "read", args: { text: args.text } } : "read_aloud needs text.";
  if (name === "history_search") return { command: "history", args: { ...(typeof args.query === "string" && { search: args.query }), ...(typeof args.limit === "number" && { limit: args.limit }) } };
  if (name === "meetings_search") return { command: "meetings", args: {} };
  return `Unknown tool ${name}.`;
}

/** One JSON-RPC message of the Model Context Protocol, answered; null for a notification. Local, one machine, the same token rules as the command line (the call goes through it). */
export async function handleMcp(msg: Message, call: Call): Promise<object | null> {
  if (msg.id === undefined || msg.id === null) return null;
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: String(CONTROL_VERSION) } });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const req = requestFor(msg.params?.name ?? "", msg.params?.arguments ?? {});
      return reply(content(typeof req === "string" ? fail("usage", req) : await call(req)));
    }
    default:
      return error(-32601, "Method not found");
  }
}

/** Reads one JSON message per line from `input` and writes the answers to `output`. Resolves when the input ends. */
export async function serveMcp(input: Readable, output: Writable, call: Call): Promise<void> {
  for await (const line of createInterface({ input })) {
    if (!line.trim()) continue;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    const answer = await handleMcp(msg, call);
    if (answer) output.write(`${JSON.stringify(answer)}\n`);
  }
}
