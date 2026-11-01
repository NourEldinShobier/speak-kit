import { KokoroEngine } from "@speakkit/engine";
const e = new KokoroEngine({
  modelsDir: "D:/workspaces/speak-it/code/.cache/models",
  threads: Number(process.env.T ?? 6),
});
await e.start();
const text = "The quick brown fox jumps over the lazy dog near the old river.";
const ts = [];
for (let i = 0; i < 5; i++) {
  const t = performance.now();
  await e.synthesize(text, { voice: "af_heart", speed: 1 });
  ts.push(Math.round(performance.now() - t));
}
console.log("engine-only ms", ts.join(","));
await e.close();
process.exit(0);
