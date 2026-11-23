// Stand-in for writer/worker.ts as a child process: same IPC protocol, no model.
// A model path containing "bad" fails to load. The text "hang" never gets an answer, "boom" gets an error, anything else is answered "<system>|<TEXT>".
import { appendFileSync } from "node:fs";
const init = JSON.parse(process.env.SPEAKKIT_WORKER_INIT);
if (process.env.SPEAKKIT_FAKE_LOG) appendFileSync(process.env.SPEAKKIT_FAKE_LOG, `start gpu=${init.gpu}\n`);
process.send({ type: "status", state: "loading" });
if (init.modelPath.includes("bad")) process.send({ type: "fatal", message: "cannot open model" });
else process.send({ type: "status", state: "ready", backend: init.gpu ? "gpu" : "cpu", loadMs: 1 });
process.on("message", (m) => {
  if (m.type === "abort") return process.env.SPEAKKIT_FAKE_LOG && appendFileSync(process.env.SPEAKKIT_FAKE_LOG, `abort id=${m.id}\n`);
  if (m.text === "hang") return;
  if (m.text === "boom") return process.send({ type: "error", id: m.id, message: "out of memory" });
  process.send({ type: "result", id: m.id, text: `${m.system}|${m.text.toUpperCase()}` });
});
