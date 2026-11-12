import * as v from "valibot";
import type { AppClient } from "./client";
import { CliError } from "./errors";

/** MCP versions this server can speak; it answers with the one the client asked for, else the newest. */
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

const INSTRUCTIONS =
  "Speak Kit reads text aloud on the user's computer, with a local voice. Use speak to read something now (queue: true to wait behind the current reading), print: true to preview the sentences without speaking, stop to stop, status and queue to look. Nothing leaves the computer.";

interface Tool {
  name: string;
  description: string;
  readOnly: boolean;
  input: Record<string, unknown>;
  schema: v.GenericSchema;
  run(client: AppClient, args: never): Promise<unknown>;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const speakArgs = v.strictObject({ text: v.string(), queue: v.exactOptional(v.boolean()), print: v.exactOptional(v.boolean()) });
const stopArgs = v.strictObject({ keepQueue: v.exactOptional(v.boolean()) });
const none = v.strictObject({});

const TOOLS: Tool[] = [
  {
    name: "speak",
    description: "Read text aloud with Speak Kit. By default it replaces what is playing; queue: true waits behind it. print: true speaks nothing and returns the sentences it would read.",
    readOnly: false,
    input: objectSchema({ text: { type: "string", description: "The text to read." }, queue: { type: "boolean" }, print: { type: "boolean" } }, ["text"]),
    schema: speakArgs,
    run: (c, a: v.InferOutput<typeof speakArgs>) => c.speak({ text: a.text, ...(a.queue && { mode: "queue" as const }), ...(a.print && { dryRun: true }) }),
  },
  {
    name: "stop",
    description: "Stop reading and empty the waiting list. keepQueue: true goes on with the next waiting reading instead.",
    readOnly: false,
    input: objectSchema({ keepQueue: { type: "boolean" } }),
    schema: stopArgs,
    run: (c, a: v.InferOutput<typeof stopArgs>) => c.stop(!a.keepQueue),
  },
  { name: "status", description: "What Speak Kit is reading now.", readOnly: true, input: objectSchema({}), schema: none, run: (c) => c.status() },
  { name: "queue", description: "The reading in progress and the readings waiting behind it.", readOnly: true, input: objectSchema({}), schema: none, run: (c) => c.queue() },
  { name: "voices", description: "The installed voices and the default one.", readOnly: true, input: objectSchema({}), schema: none, run: (c) => c.voices() },
  { name: "capabilities", description: "What this version of Speak Kit can do, with its error codes.", readOnly: true, input: objectSchema({}), schema: none, run: (c) => c.capabilities() },
];

const message = v.looseObject({ jsonrpc: v.literal("2.0"), method: v.string(), id: v.exactOptional(v.union([v.string(), v.number()])), params: v.exactOptional(v.unknown()) });

type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
const fail = (id: Reply["id"], code: number, text: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message: text } });

async function callTool(client: () => Promise<AppClient>, params: unknown): Promise<{ content: { type: "text"; text: string }[]; isError?: true }> {
  const p = v.safeParse(v.looseObject({ name: v.string(), arguments: v.exactOptional(v.unknown()) }), params);
  const tool = p.success ? TOOLS.find((t) => t.name === p.output.name) : undefined;
  if (!p.success || !tool) throw new CliError("invalid_input", "unknown tool");
  const args = v.safeParse(tool.schema, p.output.arguments ?? {});
  if (!args.success) return { isError: true, content: [{ type: "text", text: `invalid_input: ${args.issues[0]?.message ?? "bad arguments"}` }] };
  try {
    const result = await tool.run(await client(), args.output as never);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e) {
    const err = e instanceof CliError ? e : new CliError("failed", e instanceof Error ? e.message : String(e));
    return { isError: true, content: [{ type: "text", text: `${err.code}: ${err.message}` }] };
  }
}

async function handle(raw: unknown, client: () => Promise<AppClient>, version: string): Promise<Reply | null> {
  const m = v.safeParse(message, raw);
  if (!m.success) return fail(null, -32600, "invalid request");
  const { id, method, params } = m.output;
  if (id === undefined) return null; // a notification (initialized, cancelled) needs no answer
  switch (method) {
    case "initialize": {
      const asked = (params as { protocolVersion?: unknown } | null | undefined)?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.find((x) => x === asked) ?? PROTOCOL_VERSIONS[0];
      return { jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "speakkit", version }, instructions: INSTRUCTIONS } };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input, annotations: { readOnlyHint: t.readOnly, openWorldHint: false } })) },
      };
    case "tools/call":
      try {
        return { jsonrpc: "2.0", id, result: await callTool(client, params) };
      } catch {
        return fail(id, -32602, "unknown tool");
      }
    default:
      return fail(id, -32601, `method not found: ${method}`);
  }
}

/**
 * An MCP server on newline-delimited JSON-RPC: one message per line in, one reply per line out. It returns when the input ends,
 * after the calls still running have answered. The app is looked up per call, so the server starts (and lists its tools) before the app does.
 */
export async function serveMcp(o: { lines: AsyncIterable<string>; write(line: string): void; client: () => Promise<AppClient>; version: string }): Promise<void> {
  const pending = new Set<Promise<void>>();
  for await (const line of o.lines) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      o.write(JSON.stringify(fail(null, -32700, "parse error")));
      continue;
    }
    const job = handle(raw, o.client, o.version)
      .then((r) => void (r && o.write(JSON.stringify(r))))
      .finally(() => pending.delete(job));
    pending.add(job);
  }
  await Promise.all(pending);
}
