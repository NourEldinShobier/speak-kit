// Usage: node --expose-gc --import ./register.mjs bench/leak.ts <cycles> <synth 0|1> <warmup 0|1>
import { KokoroEngine } from "@speakkit/engine";
const [cycles, synth, warmup] = process.argv.slice(2).map(Number);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const m = () => {
  const u = process.memoryUsage();
  return `rss ${Math.round(u.rss / 1048576)} heap ${Math.round(u.heapUsed / 1048576)} ext ${Math.round(u.external / 1048576)} ab ${Math.round(u.arrayBuffers / 1048576)}`;
};
const e = new KokoroEngine({ modelsDir: "../../.cache/models", warmup: !!warmup });
for (let i = 0; i < cycles; i++) {
  await e.start();
  if (synth) await e.synthesize("The quick brown fox jumps over the lazy dog.", { voice: "af_heart", speed: 1 });
  await e.unload();
  (globalThis as any).gc?.();
  await sleep(800);
  (globalThis as any).gc?.();
  console.log(i, m());
}
process.exit(0);
