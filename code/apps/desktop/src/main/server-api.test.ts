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
const LIST = { active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro", state: "ready" }] };

describe("ServerApi", () => {
  it("lists engines with the bearer token and validates the answer", async () => {
    const { api, seen } = await stub((_r, _b, res) => json(res, 200, LIST));
    expect(await api.engines()).toEqual(LIST);
    expect(seen).toEqual([{ method: "GET", url: "/v1/engines", auth: "Bearer tok", body: "" }]);
  });

  it("turns the server's error body into a ServerError with status, code and the server's detail", async () => {
    const { api } = await stub((_r, _b, res) => json(res, 404, { error: { code: "not-found", message: "no such endpoint" } }));
    await expect(api.engines()).rejects.toMatchObject({ status: 404, code: "not-found", error: { code: "server-error", args: { status: 404, detail: "no such endpoint" } } });
    await expect(api.engines()).rejects.toBeInstanceOf(ServerError);
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

  it("asks for the page events of a time range and keeps the fields of each kind", async () => {
    const events = [
      { type: "click", at: 5, page: "http://localhost:3000/", element: { tag: "button", label: "Pay" } },
      { type: "failed-request", at: 6, page: "http://localhost:3000/", method: "GET", path: "/api", status: 500 },
    ];
    const { api, seen } = await stub((_r, _b, res) => json(res, 200, { events }));
    expect(await api.pageEvents(1, 9)).toEqual(events);
    expect(seen[0]!.url).toBe("/v1/capture/page-context?from=1&to=9");
  });
});
