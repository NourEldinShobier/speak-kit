// Lifecycle measurements with the real model.
// Usage (from code/packages/server): node --import ./register.mjs bench/lifecycle.ts [cycles=50]
//   SPEAKKIT_WORKER_URL=<path to engine/dist/worker.js> to measure the packed worker.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FrameDecoder } from "@speakkit/protocol";
import { KokoroEngine } from "@speakkit/engine";
import { createServer } from "../src";

const env = process.env;
const cycles = Number(process.argv[2] ?? 50);
// Memory of the whole server: this process plus the model host process (isolation "process") when loaded.
function childMb(): number {
  const pid = engine.workerPid;
  if (!pid) return 0;
  const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
  const kb = /"([\d.,]+) K"\s*$/m.exec(r.stdout)?.[1];
  return kb ? Number(kb.replace(/[.,]/g, "")) / 1024 : 0;
}
const mb = () => Math.round((process.memoryUsage().rss / 1048576 + childMb()) * 10) / 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const settle = async () => (gc(), await sleep(1500), gc(), mb());
const w = env.SPEAKKIT_WORKER_URL;

const engine: KokoroEngine = new KokoroEngine({
  isolation: env.SPEAKKIT_ISOLATION === "thread" ? "thread" : "process",
  modelsDir: env.SPEAKKIT_MODELS_DIR ?? "../../.cache/models",
  workerUrl: w ? pathToFileURL(w) : undefined,
});
const server = createServer({
  engine,
  dataDir: mkdtempSync(join(tmpdir(), "speakkit-life-")),
  port: 0,
  idleUnloadMs: 0, // unload is driven by this script
});
await server.listen();
const base = `http://127.0.0.1:${server.port}`;
const headers = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
const sentence = "The quick brown fox jumps over the lazy dog.";

async function firstFrameMs(): Promise<number> {
  const t0 = performance.now();
  const res = await fetch(`${base}/v1/speak`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sentences: [sentence], voice: "af_heart", speed: 1 }),
  });
  const dec = new FrameDecoder();
  let first = -1;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) for (const f of dec.push(chunk)) if (first < 0 && f.header.type === "audio") first = performance.now() - t0;
  return Math.round(first);
}
async function waitReady() {
  while (engine.status().state !== "ready") await sleep(10);
}
const out: Record<string, unknown> = { state0: engine.status().state };

out.rssBaselineMb = await settle(); // server up, nothing loaded

// cold: first request loads the model
out.coldTtfaMs = await firstFrameMs();
out.rssReadyMb = await settle();
out.warmTtfaMs = await firstFrameMs();
const warmRuns = [];
for (let i = 0; i < 5; i++) warmRuns.push(await firstFrameMs());
out.warmTtfaMs5 = warmRuns;

await engine.unload();
out.rssUnloadedMb = await settle();
const ready = out.rssReadyMb as number;
const base0 = out.rssBaselineMb as number;
out.returnedPct = Math.round((100 * (ready - (out.rssUnloadedMb as number))) / (ready - base0));

// pure load time (warm endpoint, no request)
let t = performance.now();
await fetch(`${base}/v1/engine/warm`, { method: "POST", headers });
await waitReady();
out.loadMs = Math.round(performance.now() - t);
await engine.unload();

// warm called before the click: request arrives 1.0 s / 0.3 s after the warm call (or right away)
for (const delay of [1000, 300, 0]) {
  await settle();
  await fetch(`${base}/v1/engine/warm`, { method: "POST", headers });
  const tw = performance.now();
  await sleep(delay);
  const tf = await firstFrameMs();
  out[`warmedThenClick_${delay}ms_ttfaMs`] = tf;
  out[`warmedThenClick_${delay}ms_totalFromWarmMs`] = Math.round(performance.now() - tw - 0);
  await engine.unload();
}

const rss: number[] = [];
const loads: number[] = [];
for (let i = 0; i < cycles; i++) {
  t = performance.now();
  await engine.start();
  loads.push(Math.round(performance.now() - t));
  await firstFrameMs();
  if (i === 0 || i === cycles - 1 || i % 10 === 9) rss.push(await settle());
  await engine.unload();
}
const unloadedAfter = await settle();
out.cycles = cycles;
out.cycleLoadMsMedian = loads.slice().sort((a, b) => a - b)[Math.floor(loads.length / 2)];
out.cycleLoadMsMax = Math.max(...loads);
out.cycleReadyRssSamplesMb = rss;
out.cycleReadyRssGrowthPct = Math.round((1000 * (rss.at(-1)! - rss[0]!)) / rss[0]!) / 10;
out.rssUnloadedAfterCyclesMb = unloadedAfter;
out.unloadedRssGrowthPct = Math.round((1000 * (unloadedAfter - (out.rssUnloadedMb as number))) / (out.rssUnloadedMb as number)) / 10;

console.log(JSON.stringify(out, null, 2));
await server.close();
await engine.close();
process.exit(0);
