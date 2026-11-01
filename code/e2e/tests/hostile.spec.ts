import { request } from "node:http";
import { test, expect } from "@playwright/test";
import type { ErrorCode } from "@speakkit/protocol";
import { startReal } from "../support/real-server";

interface Reply {
  status: number;
  code?: ErrorCode;
  allowOrigin?: string | string[];
}

let server: Awaited<ReturnType<typeof startReal>>;
test.beforeAll(async () => {
  server = await startReal({ warm: false, env: { SPEAKKIT_ENGINE: "fake" } });
});
test.afterAll(async () => {
  await server.stop();
});

/** Raw HTTP so the Host header and the body size are exactly what the test says; fetch would rewrite or refuse them. */
function send(o: { method?: string; path?: string; headers?: Record<string, string>; body?: Buffer }): Promise<Reply> {
  const headers = { Host: `127.0.0.1:${server.port}`, ...o.headers };
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, method: o.method ?? "GET", path: o.path ?? "/v1/auth/check", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const code = text ? (JSON.parse(text) as { error?: { code: ErrorCode } }).error?.code : undefined;
        resolve({ status: res.statusCode ?? 0, ...(code && { code }), ...(res.headers["access-control-allow-origin"] && { allowOrigin: res.headers["access-control-allow-origin"] }) });
      });
    });
    req.on("error", reject);
    req.end(o.body);
  });
}
const auth = () => ({ Authorization: `Bearer ${server.token}` });

test.describe("hostile clients against the real server (fake engine)", () => {
  test("the right Host and token are accepted", async () => {
    expect(await send({ headers: auth() })).toEqual({ status: 204 });
  });

  test("a wrong Host header is refused before the token is checked (DNS rebinding)", async () => {
    for (const host of ["evil.example", `evil.example:${server.port}`, `127.0.0.1:${server.port + 1}`, `localhost.evil.example:${server.port}`]) {
      expect(await send({ headers: { ...auth(), Host: host } }), host).toEqual({ status: 403, code: "forbidden" });
    }
  });

  test("a web page origin is refused, even with the right token (CSRF)", async () => {
    for (const origin of ["https://evil.example", "http://localhost:3000", "null", "file://", "moz-extension://abc"]) {
      const r = await send({ headers: { ...auth(), Origin: origin } });
      expect(r, origin).toEqual({ status: 403, code: "forbidden" });
    }
  });

  test("a preflight from a web page or without an origin is refused", async () => {
    expect(await send({ method: "OPTIONS", path: "/v1/speak", headers: { Origin: "https://evil.example" } })).toEqual({ status: 403, code: "forbidden" });
    expect(await send({ method: "OPTIONS", path: "/v1/speak" })).toEqual({ status: 403, code: "forbidden" });
  });

  test("a missing, wrong or malformed token is rejected on every protected route", async () => {
    const bad: Record<string, string>[] = [
      {},
      { Authorization: "Bearer wrong-token" },
      { Authorization: server.token },
      { Authorization: `Basic ${server.token}` },
      { Authorization: `Bearer ${server.token}x` },
      { Authorization: "Bearer " },
    ];
    for (const [method, path] of [
      ["GET", "/v1/auth/check"],
      ["GET", "/v1/voices"],
      ["POST", "/v1/speak"],
      ["POST", "/v1/engine/warm"],
      ["POST", "/v1/export"],
    ] as const) {
      for (const headers of bad) expect(await send({ method, path, headers }), `${method} ${path} ${JSON.stringify(headers)}`).toEqual({ status: 401, code: "token-rejected" });
    }
  });

  test("a body over 2 MB is refused with 413 and the server keeps answering", async () => {
    const body = Buffer.alloc(2 * 1024 * 1024 + 1, 0x20);
    const r = await send({ method: "POST", path: "/v1/speak", headers: { ...auth(), "Content-Type": "application/json", "Content-Length": String(body.length) }, body });
    expect(r).toEqual({ status: 413, code: "invalid-request" });
    expect(await send({ headers: auth() })).toEqual({ status: 204 });
  });

  test("a body that is not JSON is refused with 400", async () => {
    const r = await send({ method: "POST", path: "/v1/speak", headers: { ...auth(), "Content-Type": "application/json" }, body: Buffer.from("{not json") });
    expect(r).toEqual({ status: 400, code: "invalid-request" });
  });

  test("an extension origin gets its own CORS header and no other", async () => {
    const origin = `chrome-extension://${"a".repeat(32)}`;
    const r = await send({ headers: { ...auth(), Origin: origin } });
    expect(r).toEqual({ status: 204, allowOrigin: origin });
  });
});
