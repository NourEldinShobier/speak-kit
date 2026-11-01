import { request } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FrameDecoder, type Frame } from "@speakkit/protocol";
import { FakeEngine, type FakeEngineOptions } from "@speakkit/engine";
import { createServer, type ServerOptions, type SpeakKitServer } from "../src";

export interface Ctx {
  engine: FakeEngine;
  server: SpeakKitServer;
  base: string;
  token: string;
  auth: Record<string, string>;
}

export async function start(
  opts: FakeEngineOptions = {},
  token?: string,
  serverOpts: Partial<ServerOptions> = {},
): Promise<Ctx> {
  const engine = new FakeEngine(opts);
  const server = createServer({
    engine,
    dataDir: mkdtempSync(join(tmpdir(), "speakkit-")),
    port: 0,
    version: "9.9.9",
    token,
    ...serverOpts,
  });
  await server.listen();
  return {
    engine,
    server,
    base: `http://127.0.0.1:${server.port}`,
    token: server.token,
    auth: { Authorization: `Bearer ${server.token}` },
  };
}

/** Raw request, so tests can set Host and Origin freely. */
export function raw(
  c: Ctx,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: c.server.port, method, path, headers },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: b }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

export const speakBody = (sentences: string[], extra: object = {}) =>
  JSON.stringify({ sentences, voice: "af_heart", speed: 1, ...extra });

/** Read a /v1/speak stream to the end, with arrival time of each frame. */
export async function readFrames(res: Response): Promise<{ frame: Frame; at: number }[]> {
  const dec = new FrameDecoder();
  const out: { frame: Frame; at: number }[] = [];
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const frame of dec.push(value)) out.push({ frame, at: performance.now() });
  }
  return out;
}
