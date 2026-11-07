import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ServerApi, ServerError } from "./server-api";

const servers: http.Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

/** A stand-in for the local server: records requests, answers by route. */
async function stub(handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void) {
  const seen: { method: string; url: string; auth?: string | undefined; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const api = new ServerApi(
    () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    () => "tok",
  );
  return { api, seen };
}
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const LIST = { active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro", state: "ready", optional: false, cloning: false }] };

describe("ServerApi", () => {
  it("lists engines with the bearer token and validates the answer", async () => {
    const { api, seen } = await stub((_r, _b, res) => json(res, 200, LIST));
    expect(await api.engines()).toEqual(LIST);
    expect(seen).toEqual([{ method: "GET", url: "/v1/engines", auth: "Bearer tok", body: "" }]);
  });

  it("selects, installs, cancels and removes an engine on the documented routes", async () => {
    const { api, seen } = await stub((_r, _b, res) => json(res, 200, LIST));
    await api.selectEngine("chatterbox");
    await api.installEngine("chatterbox");
    await api.cancelInstall("chatterbox");
    await api.removeEngine("chatterbox");
    expect(seen.map((s) => `${s.method} ${s.url} ${s.body}`)).toEqual([
      'POST /v1/engines/select {"id":"chatterbox"}',
      "POST /v1/engines/chatterbox/install ",
      "POST /v1/engines/chatterbox/cancel ",
      "DELETE /v1/engines/chatterbox ",
    ]);
  });

  it("turns the server's error body into a ServerError with status, code and the server's detail", async () => {
    const { api } = await stub((_r, _b, res) => json(res, 409, { error: { code: "engine-unavailable", message: "needs a GPU" } }));
    await expect(api.selectEngine("chatterbox")).rejects.toMatchObject({ status: 409, code: "engine-unavailable", error: { code: "server-error", args: { status: 409, detail: "needs a GPU" } } });
    await expect(api.selectEngine("chatterbox")).rejects.toBeInstanceOf(ServerError);
  });

  it("reports a non-JSON failure by its status", async () => {
    const { api } = await stub((_r, _b, res) => {
      res.writeHead(502).end("bad gateway");
    });
    await expect(api.engines()).rejects.toMatchObject({ status: 502, code: "internal", error: { code: "server-error", args: { status: 502, detail: null } } });
  });

  it("rejects an answer of the wrong shape instead of passing it on", async () => {
    const { api } = await stub((_r, _b, res) => json(res, 200, { active: "kokoro", engines: "none" }));
    await expect(api.engines()).rejects.toThrow();
  });

  it("export: start, status, audio bytes and cancel", async () => {
    const job = { id: "0123456789abcdef", state: "running", done: 0, total: 2, durationMs: 0 };
    const { api, seen } = await stub((req, _b, res) => {
      if (req.url!.endsWith("/audio")) res.writeHead(200, { "Content-Type": "audio/wav" }).end(Buffer.from([1, 2, 3]));
      else if (req.method === "DELETE") res.writeHead(204).end();
      else json(res, req.method === "POST" ? 202 : 200, job);
    });
    expect(await api.startExport({ sentences: ["A.", "B."], voice: "af_heart", speed: 1, gapMs: 250 })).toEqual(job);
    expect(await api.exportStatus(job.id)).toEqual(job);
    expect([...(await api.exportAudio(job.id))]).toEqual([1, 2, 3]);
    await api.cancelExport(job.id);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(["POST /v1/export", `GET /v1/export/${job.id}`, `GET /v1/export/${job.id}/audio`, `DELETE /v1/export/${job.id}`]);
    expect(JSON.parse(seen[0]!.body)).toEqual({ sentences: ["A.", "B."], voice: "af_heart", speed: 1, gapMs: 250 });
  });
});
