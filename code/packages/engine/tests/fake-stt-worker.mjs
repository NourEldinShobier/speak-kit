// Stand-in for stt/worker.ts as a child process: same IPC protocol, no model.
// A model path containing "bad" fails to load. All-zero audio has no speech; a first sample of 999 never gets an answer.
// Anything else answers "<engine>:<samples>:<language>".
const init = JSON.parse(process.env.SPEAKKIT_WORKER_INIT);
process.send({ type: "status", state: "loading" });
if (init.modelPath.includes("bad")) process.send({ type: "fatal", message: "cannot open model" });
else process.send({ type: "status", state: "ready", backend: init.gpu ? "gpu" : "cpu" });
process.on("message", (m) => {
  if (m.pcm[0] === 999) return;
  if (m.pcm.every((s) => s === 0)) return process.send({ type: "result", id: m.id, text: "", speech: false });
  process.send({ type: "result", id: m.id, text: `${init.engine}:${m.pcm.length}:${m.language}`, speech: true });
});
