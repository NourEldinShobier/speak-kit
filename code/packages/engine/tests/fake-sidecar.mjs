// Stand-in for chatterbox_sidecar.py: same JSON-lines protocol, no Python or GPU.
// Audio is 240 samples per character; amplitude is 1000 without a reference clip and 2000 with one, plus 1000 times the exaggeration and 10 000 times cfg_weight when a request carries them.
// Text containing "crash" exits with code 3; "killed" kills the process the way an outside kill would; "hang" never answers; "fail" answers with an error;
// "oom" answers with a CUDA out-of-memory error; "slow" answers after 400 ms.
// SPEAKKIT_FAKE_LOAD_MS delays the ready message (the child environment is an allowlist, so only SPEAKKIT_* variables reach this process).
// SPEAKKIT_FAKE_LOAD_FATAL=out-of-memory|disk-full|other makes loading fail. SPEAKKIT_FAKE_PID_FILE receives this process's pid.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.SPEAKKIT_FAKE_PID_FILE) writeFileSync(process.env.SPEAKKIT_FAKE_PID_FILE, String(process.pid));
send({ kind: "progress", phase: "downloading", progress: 0.5 });
await wait(Number(process.env.SPEAKKIT_FAKE_LOAD_MS ?? 30));
const fatal = process.env.SPEAKKIT_FAKE_LOAD_FATAL;
if (fatal) {
  send({ kind: "fatal", message: fatal === "other" ? "RuntimeError: weights are corrupt" : `${fatal} while loading`, ...(fatal !== "other" && { code: fatal }) });
  process.exit(1);
}
send({ kind: "progress", phase: "loading" });
console.log("library noise that is not json");
send({ kind: "ready" });

for await (const line of createInterface({ input: process.stdin })) {
  const req = JSON.parse(line);
  if (req.op !== "synth") continue;
  if (req.text.includes("crash")) process.exit(3);
  if (req.text.includes("killed")) process.kill(process.pid, "SIGKILL");
  if (req.text.includes("hang")) continue;
  if (req.text.includes("fail")) {
    send({ kind: "error", id: req.id, message: "synthesis exploded" });
    continue;
  }
  if (req.text.includes("oom")) {
    send({ kind: "error", id: req.id, code: "out-of-memory", message: "OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB" });
    continue;
  }
  if (req.text.includes("slow")) await wait(400);
  const pcm = new Int16Array(req.text.length * 240).fill((req.reference ? 2000 : 1000) + Math.round(1000 * (req.exaggeration ?? 0)) + Math.round(10000 * (req.cfg_weight ?? 0)));
  send({ kind: "audio", id: req.id, sampleRate: 24000, pcm: Buffer.from(pcm.buffer).toString("base64") });
}
