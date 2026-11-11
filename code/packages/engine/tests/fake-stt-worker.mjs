// Stand-in for stt/worker.ts as a child process: same IPC protocol, no model.
// A model path containing "bad" fails to load; one containing "igpu" sits on a machine whose every Vulkan device is integrated, otherwise
// the first Vulkan device is integrated and device 1 is discrete (a hybrid laptop). SPEAKKIT_FAKE_LOG names a file that gets one line per start.
// All-zero audio has no speech; a first sample of 999 never gets an answer. Anything else answers "<engine>:<samples>:<language>".
import { appendFileSync } from "node:fs";
const init = JSON.parse(process.env.SPEAKKIT_WORKER_INIT);
const vk = process.env.GGML_VK_VISIBLE_DEVICES ?? "";
if (process.env.SPEAKKIT_FAKE_LOG) appendFileSync(process.env.SPEAKKIT_FAKE_LOG, `vk=${vk}\n`);
process.send({ type: "status", state: "loading" });
if (init.modelPath.includes("bad")) process.send({ type: "fatal", message: "cannot open model" });
else if (!init.gpu) process.send({ type: "status", state: "ready", backend: "cpu" });
else process.send({ type: "status", state: "ready", backend: "gpu", devices: 3, gpuKind: vk === "1" && !init.modelPath.includes("igpu") ? "discrete" : "integrated" });
process.on("message", (m) => {
  if (m.pcm[0] === 999) return;
  if (m.pcm.every((s) => s === 0)) return process.send({ type: "result", id: m.id, text: "", speech: false });
  process.send({ type: "result", id: m.id, text: `${init.engine}:${m.pcm.length}:${m.language}`, speech: true });
});
