// Stand-in for worker.ts as a child process: same IPC protocol, no model.
// "hang" in the text never answers (a stream the test then kills); anything else returns 100 samples of 500.
process.send({ type: "status", state: "ready" });
process.on("message", (m) => {
  if (m.type !== "synth" || m.text.includes("hang")) return;
  process.send({ type: "result", id: m.id, pcm: new Int16Array(100).fill(500), sampleRate: 24000 });
});
