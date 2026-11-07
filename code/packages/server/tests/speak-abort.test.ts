import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FakeEngine } from "@speakkit/engine";
import { describe, expect, it } from "vite-plus/test";
import type { EngineRegistry } from "../src/engines";
import { speakRoutes } from "../src/routes/speak";
import type { Services } from "../src/router";
import { StreamQueue } from "../src/stream-queue";
import { speakBody } from "./harness";

/** A response whose socket is full: write() says "wait for drain" and drain never comes, so the first frame stays pending until the client closes. */
class StuckResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  writableFinished = false;
  headersSent = false;
  writes = 0;
  setHeader() {}
  writeHead() {
    this.headersSent = true;
  }
  flushHeaders() {}
  write() {
    this.writes++;
    return false;
  }
  end() {
    this.writableEnded = true;
    this.emit("close");
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("POST /v1/speak after the client is gone", () => {
  it("does not synthesize the next sentence of a request whose client closed while a frame was waiting for drain", async () => {
    const engine = new FakeEngine({});
    const services = {
      engines: { active: engine } as unknown as EngineRegistry,
      queue: new StreamQueue(2, 4),
      deadlines: { controlMs: 5000, streamIdleMs: 5000 },
    } as Services;
    const req = Object.assign(Readable.from([Buffer.from(speakBody(["first", "second", "third"]))]), { headers: {} }) as unknown as IncomingMessage;
    const res = new StuckResponse();
    const done = speakRoutes[0]!.handle({ req, res: res as unknown as ServerResponse, params: [], signal: new AbortController().signal }, services);
    while (res.writes === 0) await tick(5);
    expect(engine.calls.map((c) => c.text)).toEqual(["first"]);
    res.emit("close"); // the client left
    await done;
    await tick(50);
    expect(engine.calls.map((c) => c.text)).toEqual(["first"]);
  });
});
