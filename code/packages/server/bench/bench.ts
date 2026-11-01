// Usage: SPEAKKIT_THREADS=6 SPEAKKIT_DEVICE=cpu SPEAKKIT_WARMUP=1 node --import ./register.mjs bench/bench.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FrameDecoder } from "@speakkit/protocol";
import { KokoroEngine } from "@speakkit/engine";
import { createServer } from "../src";

const env = process.env;
const threads = Number(env.SPEAKKIT_THREADS ?? 6);
const device = env.SPEAKKIT_DEVICE === "dml" ? "dml" : "cpu";
const dtype = (env.SPEAKKIT_DTYPE ?? "uint8") as "fp32" | "q8" | "uint8";
const warmup = env.SPEAKKIT_WARMUP !== "0";
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

const engine = new KokoroEngine({
  modelsDir: env.SPEAKKIT_MODELS_DIR ?? "D:/workspaces/speak-it/code/.cache/models",
  threads,
  dtype,
  device,
  warmup,
});
const server = createServer({
  engine,
  dataDir: mkdtempSync(join(tmpdir(), "speakkit-bench-")),
  port: 0,
});
await server.listen();
let t = performance.now();
await engine.start();
const loadMs = Math.round(performance.now() - t);
await new Promise((r) => setTimeout(r, 1500));
const rssAfterLoad = mb();

async function speak(sentences: string[]) {
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${server.port}/v1/speak`, {
    method: "POST",
    headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sentences, voice: "af_heart", speed: 1 }),
  });
  const dec = new FrameDecoder();
  const reader = res.body!.getReader();
  let first = 0;
  let audioMs = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const f of dec.push(value)) {
      if (f.header.type === "audio") {
        if (!first) first = performance.now() - t0;
        audioMs += f.header.durationMs;
      } else if (f.header.type === "error") throw new Error(f.header.message);
    }
  }
  const total = performance.now() - t0;
  return {
    firstMs: Math.round(first),
    totalMs: Math.round(total),
    audioMs,
    rtf: +(total / audioMs).toFixed(3),
  };
}

const twelve = "The quick brown fox jumps over the lazy dog near the old river."; // 12 words
const para = [
  "Speech synthesis has changed a great deal over the past few years.",
  "Modern neural models can produce voices that sound remarkably natural.",
  "Running them locally means that your text never leaves your computer.",
  "That also makes the whole experience faster and more reliable.",
  "The result is a reader that works anywhere, even without a connection.",
];
const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]!;

const cold = await speak([twelve]);
const warm: number[] = [];
for (let i = 0; i < 5; i++) warm.push((await speak([twelve])).firstMs);
await speak(para); // settle
const paras = [];
for (let i = 0; i < 3; i++) paras.push(await speak(para));
const bestPara = paras.sort((a, b) => a.rtf - b.rtf)[1]!; // median of 3
const rssAfterRun = mb();
console.log(
  JSON.stringify({
    dtype,
    threads,
    device,
    warmup,
    loadMs,
    rssAfterLoad,
    rssAfterRun,
    coldFirstMs: cold.firstMs,
    warmFirstMs: median(warm),
    warmAll: warm,
    paragraph: bestPara,
  }),
);
await server.close();
await engine.close();
process.exit(0);
