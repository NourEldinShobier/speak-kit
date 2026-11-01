import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExportJob } from "@speakkit/protocol";
import { FakeEngine } from "@speakkit/engine";
import { ExportManager } from "../src/export";
import { render } from "../src/render";
import { StreamQueue } from "../src/stream-queue";
import { speakBody, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = { "Content-Type": "application/json" };
const post = (c: Ctx, path: string, body: unknown) => fetch(`${c.base}${path}`, { method: "POST", headers: { ...c.auth, ...json }, body: JSON.stringify(body) });
const jobOf = async (c: Ctx, id: string) => (await (await fetch(`${c.base}/v1/export/${id}`, { headers: c.auth })).json()) as ExportJob;
async function settled(c: Ctx, id: string) {
  for (let j = await jobOf(c, id); ; j = await jobOf(c, id)) {
    if (j.state !== "running") return j;
    await sleep(10);
  }
}

describe("export faults", () => {
  it("a write error ends the job as an error and frees the slot, the file handle and the engine stream", async () => {
    const dir = mkdtempSync(join(tmpdir(), "speakkit-export-"));
    const queue = new StreamQueue(1, 4);
    let closed = false;
    let writes = 0;
    const failing = async () => ({
      write: async () => {
        if (++writes === 2) throw new Error("ENOSPC: no space left on device");
        return {};
      },
      close: async () => void (closed = true),
    });
    const exporter = new ExportManager(dir, { acquireSlot: (ac) => queue.slot(ac), render, open: failing as never });
    const engine = new FakeEngine();
    const job = await exporter.create(engine, { sentences: ["a", "b"], voice: "af_heart", speed: 1, gapMs: 0 });
    await exporter.get(job.id)!.settled;
    expect(exporter.view(exporter.get(job.id)!)).toMatchObject({ state: "error", error: "ENOSPC: no space left on device" });
    expect(closed).toBe(true);
    // the single slot is free again
    const again = await queue.slot(new AbortController());
    again();
    await exporter.close();
  });

  it("an engine error mid-export keeps the finished sentences in the progress and reports the message", async () => {
    ctx = await start({ failOn: (t) => t === "c" });
    const job = (await (await post(ctx, "/v1/export", { sentences: ["a", "b", "c", "d"], voice: "af_heart", speed: 1 })).json()) as ExportJob;
    expect(await settled(ctx, job.id)).toMatchObject({ state: "error", done: 2, error: "fake engine failure" });
  });
});

describe("stream faults", () => {
  it("a client that disconnects while its stream is queued gives up the place, not a slot", async () => {
    ctx = await start({ latencyMs: 100 }, undefined, { maxStreams: 1, maxQueue: 4 });
    const headers = { ...ctx.auth, ...json };
    const running = fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(["first"]) }).then((r) => r.arrayBuffer());
    await sleep(30);
    const ac = new AbortController();
    const queued = fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(["gone"]), signal: ac.signal }).catch(() => {});
    await sleep(30);
    ac.abort();
    await queued;
    await running;
    const after = await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(["after"]) });
    expect((await after.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(ctx.engine.calls.map((x) => x.text)).toEqual(["first", "after"]);
  });
});

describe("close()", () => {
  const resources = () => {
    const r = process.getActiveResourcesInfo();
    return { timers: r.filter((x) => x === "Timeout").length, servers: r.filter((x) => x === "TCPServerWrap").length };
  };

  it("leaves no listening socket and no timer behind after streams and exports", async () => {
    const before = resources();
    ctx = await start({ latencyMs: 20 }, undefined, { idleUnloadMs: 0 });
    const headers = { ...ctx.auth, ...json };
    await (await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(["a", "b"]) })).arrayBuffer();
    await post(ctx, "/v1/export", { sentences: ["a", "b", "c"], voice: "af_heart", speed: 1 });
    await sleep(30);
    await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(Array.from({ length: 20 }, () => "x")) }); // left open
    await ctx.server.close();
    ctx = undefined;
    for (let i = 0; i < 50 && (resources().servers > before.servers || resources().timers > before.timers); i++) await sleep(20);
    expect(resources().servers).toBeLessThanOrEqual(before.servers);
    expect(resources().timers).toBeLessThanOrEqual(before.timers);
  });
});
