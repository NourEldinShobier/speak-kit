import { mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FakeEngine } from "@speakkit/engine";

// The node server is not part of the public interface, so the test captures the one createServer makes.
const made: Server[] = [];
vi.mock("node:http", async (importOriginal) => {
  const http = await importOriginal<typeof import("node:http")>();
  return { ...http, createServer: (...a: Parameters<typeof http.createServer>) => (made.push(http.createServer(...a)), made.at(-1)!) };
});
const { createServer } = await import("../src");

let server: ReturnType<typeof createServer> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  made.length = 0;
});

const start = async (onError?: (e: Error) => void) => {
  server = createServer({ engine: new FakeEngine(), dataDir: mkdtempSync(join(tmpdir(), "speakkit-")), port: 0, ...(onError && { onError }) });
  await server.listen();
};

describe("a node server error after listening", () => {
  it("is reported to onError and does not throw", async () => {
    const onError = vi.fn();
    await start(onError);
    const e = new Error("EMFILE: too many open files");
    expect(() => made[0]!.emit("error", e)).not.toThrow();
    expect(onError).toHaveBeenCalledExactlyOnceWith(e);
  });

  it("is written to stderr when nobody listens, and does not throw", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await start();
    expect(() => made[0]!.emit("error", new Error("EMFILE: too many open files"))).not.toThrow();
    expect(write).toHaveBeenCalledWith("speakkit server error: EMFILE: too many open files\n");
    write.mockRestore();
  });
});
