// Stand-in for chatterbox_sidecar.py: same JSON-lines protocol, no Python or GPU.
// Audio is 240 samples per character; amplitude is 1000 without a reference clip and 2000 with one.
// Text containing "crash" kills the process; "fail" answers with an error.
import { createInterface } from "node:readline";

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

send({ kind: "progress", phase: "downloading", progress: 0.5 });
await wait(Number(process.env.FAKE_LOAD_MS ?? 30));
send({ kind: "progress", phase: "loading" });
console.log("library noise that is not json");
send({ kind: "ready" });

for await (const line of createInterface({ input: process.stdin })) {
  const req = JSON.parse(line);
  if (req.op !== "synth") continue;
  if (req.text.includes("crash")) process.exit(3);
  if (req.text.includes("fail")) {
    send({ kind: "error", id: req.id, message: "synthesis exploded" });
    continue;
  }
  const pcm = new Int16Array(req.text.length * 240).fill(req.reference ? 2000 : 1000);
  send({ kind: "audio", id: req.id, sampleRate: 24000, pcm: Buffer.from(pcm.buffer).toString("base64") });
}
