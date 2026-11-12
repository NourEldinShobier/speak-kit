import { afterEach, describe, expect, it } from "vite-plus/test";
import { AutomationFault } from "@speakkit/server";
import { AppClient } from "./client";
import { serveMcp } from "./mcp";
import { startApp } from "./testing/kit";

let app: Awaited<ReturnType<typeof startApp>> | undefined;
afterEach(async () => {
  await app?.server.close();
  app = undefined;
});

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: string; additionalProperties: boolean; required: string[] };
  annotations: { readOnlyHint: boolean };
}
interface Reply {
  jsonrpc: string;
  id: string | number | null;
  result: { protocolVersion: string; instructions: string; tools: Tool[]; content: { type: string; text: string }[]; isError?: boolean };
  error: { code: number; message: string };
}

/** Sends the messages, returns the parsed replies in the order they were written. */
async function session(messages: unknown[], client?: () => Promise<AppClient>, raw: string[] = []) {
  app ??= await startApp();
  const out: Reply[] = [];
  const lines = [...raw, ...messages.map((m) => JSON.stringify(m))];
  await serveMcp({
    lines: (async function* () {
      yield* lines;
    })(),
    write: (l) => void out.push(JSON.parse(l) as Reply),
    client: client ?? (async () => new AppClient({ base: `http://127.0.0.1:${app!.server.port}`, token: app!.server.token })),
    version: "9.9.9",
  });
  return out as [Reply, ...Reply[]]; // tests that expect no reply compare the array itself
}
const call = (id: number, name: string, args: unknown = {}) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("handshake", () => {
  it("answers initialize with the client's protocol version and its tools capability", async () => {
    const [r] = await session([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }]);
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "speakkit", version: "9.9.9" } } });
    expect(r.result.instructions).toContain("reads text aloud");
  });
  it("offers the newest version when the client asks for one it does not know", async () => {
    const [r] = await session([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }]);
    expect(r.result.protocolVersion).toBe("2025-11-25");
  });
  it("does not answer notifications", async () => {
    expect(await session([{ jsonrpc: "2.0", method: "notifications/initialized" }])).toEqual([]);
  });
  it("answers ping", async () => {
    expect(await session([{ jsonrpc: "2.0", id: "p", method: "ping" }])).toEqual([{ jsonrpc: "2.0", id: "p", result: {} }]);
  });
  it("starts and lists its tools while the app is not running", async () => {
    const never = async (): Promise<AppClient> => {
      throw new Error("must not connect to list tools");
    };
    const [r] = await session([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], never);
    expect(r.result.tools.map((t) => t.name)).toEqual(["speak", "stop", "status", "queue", "voices", "capabilities"]);
  });
});

describe("tools/list", () => {
  it("describes every tool with an object schema and read-only hints", async () => {
    const [r] = await session([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
    for (const t of r.result.tools) {
      expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(t.description.length).toBeGreaterThan(10);
    }
    const byName = Object.fromEntries(r.result.tools.map((t) => [t.name, t.annotations.readOnlyHint]));
    expect(byName).toEqual({ speak: false, stop: false, status: true, queue: true, voices: true, capabilities: true });
    expect(r.result.tools[0]!.inputSchema.required).toEqual(["text"]);
  });
});

describe("tools/call", () => {
  it("speaks and returns the result as JSON text", async () => {
    const [r] = await session([call(1, "speak", { text: "Hello." })]);
    expect(r.result.isError).toBeUndefined();
    expect(JSON.parse(r.result.content[0]!.text)).toEqual({ id: "r1", position: 0, sentences: 2, estimatedMs: 3000 });
    expect(app!.host.spoken).toEqual([{ text: "Hello." }]);
  });
  it("passes queue and print through", async () => {
    await session([call(1, "speak", { text: "A.", queue: true }), call(2, "speak", { text: "B.", print: true })]);
    expect(app!.host.spoken).toEqual([
      { text: "A.", mode: "queue" },
      { text: "B.", dryRun: true },
    ]);
  });
  it("stop clears the list unless keepQueue is set", async () => {
    await session([call(1, "stop"), call(2, "stop", { keepQueue: true })]);
    expect(app!.host.stops).toEqual([true, false]);
  });
  it.each(["status", "queue", "voices", "capabilities"])("%s answers with JSON", async (name) => {
    const [r] = await session([call(1, name)]);
    expect(() => JSON.parse(r.result.content[0]!.text)).not.toThrow();
    expect(r.result.isError).toBeUndefined();
  });
  it("returns an app refusal as a tool error with its code, not as a protocol error", async () => {
    app = await startApp();
    app.host.fault = new AutomationFault("model_missing");
    const [r] = await session([call(1, "speak", { text: "Hi." })]);
    expect(r.error).toBeUndefined();
    expect(r.result).toEqual({ isError: true, content: [{ type: "text", text: "model_missing: The speech model is not downloaded yet." }] });
  });
  it("returns not_running as a tool error when the app is not there", async () => {
    const down = async () => new AppClient({ base: "http://127.0.0.1:1", token: "t" });
    const [r] = await session([call(1, "status")], down);
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]!.text).toContain("not_running");
  });
  it("returns a failed discovery as a tool error too", async () => {
    const [r] = await session([call(1, "status")], async () => {
      throw new Error("no token");
    });
    expect(r.result).toEqual({ isError: true, content: [{ type: "text", text: "failed: no token" }] });
  });
  it.each([[{}], [{ text: 5 }], [{ text: "x", queue: "yes" }], [{ text: "x", voice: "af" }]])("refuses the speak arguments %j as invalid_input", async (args) => {
    const [r] = await session([call(1, "speak", args)]);
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]!.text).toMatch(/^invalid_input: /);
    expect(app!.host.spoken).toEqual([]);
  });
  it("answers an unknown tool with a protocol error", async () => {
    const [r] = await session([call(1, "dance")]);
    expect(r.error).toEqual({ code: -32602, message: "unknown tool" });
  });
});

describe("bad input", () => {
  it("answers an unknown method with -32601", async () => {
    const [r] = await session([{ jsonrpc: "2.0", id: 4, method: "resources/list" }]);
    expect(r.error).toEqual({ code: -32601, message: "method not found: resources/list" });
  });
  it("answers text that is not JSON with -32700 and keeps going", async () => {
    const out = await session([{ jsonrpc: "2.0", id: 1, method: "ping" }], undefined, ["{nope", "", "   "]);
    expect(out).toEqual([
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { jsonrpc: "2.0", id: 1, result: {} },
    ]);
  });
  it.each([[[]], [42], [{ id: 1 }], [{ jsonrpc: "1.0", id: 1, method: "ping" }], [{ jsonrpc: "2.0", id: 1, method: 5 }]])("answers the message %j with -32600", async (m) => {
    const [r] = await session([m]);
    expect(r.error).toEqual({ code: -32600, message: "invalid request" });
  });
  it("answers every one of many calls made at once", async () => {
    const out = await session(Array.from({ length: 30 }, (_, i) => call(i, "status")));
    expect(out.map((r) => r.id as number).sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });
});
