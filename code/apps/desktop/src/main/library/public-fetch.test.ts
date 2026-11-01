import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fetchPage } from "./fetch-url";
import { isNonPublicError, publicFetch, publicLookup, type Resolve } from "./public-fetch";

const lookup = (resolve: Resolve, host = "site.test", all = false) =>
  new Promise<{ err: unknown; result: unknown }>((done) =>
    publicLookup(resolve)(host, { all } as never, ((err: unknown, a: unknown, family?: number) => done({ err, result: all ? a : [a, family] })) as never),
  );

describe("publicLookup", () => {
  it("hands the connection the address it checked, as one answer or as the list", async () => {
    expect((await lookup(async () => ["93.184.216.34"])).result).toEqual(["93.184.216.34", 4]);
    expect((await lookup(async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"], "site.test", true)).result).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it.each([["127.0.0.1"], ["::1"], ["10.1.2.3"], ["192.168.1.20"], ["169.254.169.254"], ["100.64.0.1"], ["::ffff:127.0.0.1"], ["fe80::1"]])("refuses a name that resolves to %s", async (ip) => {
    expect(isNonPublicError((await lookup(async () => [ip])).err)).toBe(true);
  });

  it("refuses a name when any one of its answers is private", async () => {
    expect(isNonPublicError((await lookup(async () => ["93.184.216.34", "10.0.0.5"])).err)).toBe(true);
  });

  it("resolves once per connection: a resolver that flips to a private address afterwards is never asked again", async () => {
    const answers = [["93.184.216.34"], ["127.0.0.1"]];
    let calls = 0;
    const first = await lookup(async () => answers[calls++]!);
    expect(first.result).toEqual(["93.184.216.34", 4]);
    expect(calls).toBe(1);
  });

  it("passes a resolver failure on", async () => {
    const r = await lookup(async () => Promise.reject(new Error("ENOTFOUND")));
    expect(r.err).toMatchObject({ message: "ENOTFOUND" });
    expect(isNonPublicError(r.err)).toBe(false);
  });
});

describe("publicFetch", () => {
  let server: Server | undefined;
  let hits = 0;
  afterEach(() => server?.close());
  const listen = async () => {
    hits = 0;
    server = createServer((_req, res) => {
      hits++;
      res.setHeader("content-type", "text/plain");
      res.end("secret");
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    return (server.address() as AddressInfo).port;
  };

  it("never connects when the name resolves to this machine, even if the resolver would answer publicly next time", async () => {
    const port = await listen();
    const answers = [["127.0.0.1"], ["93.184.216.34"]];
    let calls = 0;
    const doFetch = publicFetch(async () => answers[calls++]!);
    await expect(fetchPage(`http://rebind.test:${port}/`, doFetch)).rejects.toMatchObject({
      reason: "network",
      message: "rebind.test:" + port + " is on this computer or your local network. Only public web addresses can be read.",
    });
    expect(hits).toBe(0);
    expect(calls).toBe(1);
  });

  it.each(["http://127.0.0.1:1/", "http://[::1]:1/", "http://169.254.169.254/latest", "http://2130706433:1/"])("refuses the address %s before any request", async (url) => {
    let resolved = false;
    await expect(
      fetchPage(
        url,
        publicFetch(async () => ((resolved = true), [])),
      ),
    ).rejects.toMatchObject({ reason: "network", message: expect.stringContaining("Only public web addresses") });
    expect(resolved).toBe(false);
  });

  it("refuses a redirect to a local service", async () => {
    const port = await listen();
    const guarded = publicFetch(async () => ["93.184.216.34"]);
    const seen: string[] = [];
    const doFetch = ((u: URL, init?: RequestInit) => {
      seen.push(u.host);
      return u.hostname === "public.test" ? Promise.resolve(new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${port}/` } })) : guarded(u, init);
    }) as unknown as typeof fetch;
    await expect(fetchPage("http://public.test/", doFetch)).rejects.toMatchObject({ reason: "network", message: expect.stringContaining("Only public web addresses") });
    expect(seen).toEqual(["public.test", `127.0.0.1:${port}`]);
    expect(hits).toBe(0);
  });
});
