import { describe, expect, it } from "vite-plus/test";
import { parseSse } from "./sse";

const body = (...chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(typeof x === "string" ? new TextEncoder().encode(x) : x);
      c.close();
    },
  });
const all = async (b: ReadableStream<Uint8Array>) => {
  const out = [];
  for await (const e of parseSse(b)) out.push(e);
  return out;
};

describe("parseSse", () => {
  it("reads named events", async () => {
    expect(await all(body('event: status\ndata: {"a":1}\n\nevent: status\ndata: {"a":2}\n\n'))).toEqual([
      { event: "status", data: '{"a":1}' },
      { event: "status", data: '{"a":2}' },
    ]);
  });
  it("joins an event split across chunks, even inside a character", async () => {
    const bytes = new TextEncoder().encode("event: status\ndata: é\n\n");
    const mid = bytes.indexOf(0xc3) + 1;
    expect(await all(body(bytes.slice(0, mid), bytes.slice(mid)))).toEqual([{ event: "status", data: "é" }]);
  });
  it("skips heartbeat comments and blocks without data", async () => {
    expect(await all(body(": hb\n\n: hb\n\nevent: x\n\ndata: y\n\n"))).toEqual([{ event: "message", data: "y" }]);
  });
  it("joins several data lines and accepts CRLF", async () => {
    expect(await all(body("event: s\r\ndata: a\r\ndata: b\r\n\r\n"))).toEqual([{ event: "s", data: "a\nb" }]);
  });
  it("drops a trailing event that never finished", async () => {
    expect(await all(body("data: done\n\ndata: cut"))).toEqual([{ event: "message", data: "done" }]);
  });
  it("is empty for an empty body", async () => {
    expect(await all(body())).toEqual([]);
  });
});
