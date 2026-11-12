import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { DownloadError, downloadModel } from "../src";

// "abcdefghij" repeated 100 times.
const BODY = Buffer.from("abcdefghij".repeat(100));
const file = { file: "m.bin", url: "https://primary.test/m.bin", sha256: "c49bba59ccc72847b869b364a909a52606e91412eccdc570032df23b181fdfa9", bytes: 1000 };

let dir: string;
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), "dl-hosts-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const refused = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });

describe("download hosts", () => {
  it("names the host that could not be reached and keeps the partial file", async () => {
    await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 214));
    const failure = await downloadModel(file, join(dir, "m.bin"), {
      fetch: async () => {
        throw refused;
      },
    }).catch((e) => e);
    expect(failure).toBeInstanceOf(DownloadError);
    expect(failure.host).toBe("primary.test");
    expect(failure.kind).toBe("unreachable");
    expect(failure.keptBytes).toBe(214);
    expect((await stat(join(dir, "m.bin.part"))).size).toBe(214);
  });

  it("tries the second host from where the first stopped when the first cannot be reached", async () => {
    await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 300));
    const asked: { url: string; range: string }[] = [];
    await downloadModel({ ...file, mirrors: ["https://second.test/m.bin"] }, join(dir, "m.bin"), {
      fetch: (async (url: string, init: { headers: Record<string, string> }) => {
        asked.push({ url, range: init.headers.Range ?? "" });
        if (url.startsWith("https://primary")) throw refused;
        return new Response(BODY.subarray(300), { status: 206 });
      }) as unknown as typeof fetch,
    });
    expect(asked).toEqual([
      { url: "https://primary.test/m.bin", range: "bytes=300-" },
      { url: "https://second.test/m.bin", range: "bytes=300-" },
    ]);
    expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
  });

  it("reports the last host when every host fails", async () => {
    const failure = await downloadModel({ ...file, mirrors: ["https://second.test/m.bin"] }, join(dir, "m.bin"), { fetch: async () => new Response("no", { status: 503 }) }).catch((e) => e);
    expect(failure.host).toBe("second.test");
    expect(failure.kind).toBe("server");
  });

  it("does not try another host after a checksum failure", async () => {
    let calls = 0;
    const failure = await downloadModel({ ...file, mirrors: ["https://second.test/m.bin"] }, join(dir, "m.bin"), {
      fetch: async () => (calls++, new Response(Buffer.alloc(1000, 1), { status: 200 })),
    }).catch((e) => e);
    expect(failure.kind).toBe("checksum");
    expect(calls).toBe(1);
    await expect(stat(join(dir, "m.bin.part"))).rejects.toThrow();
  });

  it("an abort (pause or cancel) is rethrown as it is, not turned into a network failure", async () => {
    const ac = new AbortController();
    const reason = new Error("paused");
    const p = downloadModel(file, join(dir, "m.bin"), {
      signal: ac.signal,
      fetch: async () => {
        ac.abort(reason);
        throw reason;
      },
    });
    await expect(p).rejects.toBe(reason);
  });
});
