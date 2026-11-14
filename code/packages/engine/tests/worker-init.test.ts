import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const worker = fileURLToPath(new URL("../src/worker.ts", import.meta.url));
const sttWorker = fileURLToPath(new URL("../src/stt/worker.ts", import.meta.url));

describe("kokoro worker start-up", () => {
  // The worker runs as raw TypeScript under node (type stripping), so this also proves its imports resolve there.
  it("fails with a readable message when its start-up config is missing a field", () => {
    const r = spawnSync(process.execPath, [worker], { env: { ...process.env, SPEAKKIT_WORKER_INIT: '{"modelId":"m"}' }, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("modelsDir");
  });

  it("fails with a readable message when no config was passed", () => {
    const env = { ...process.env };
    delete env.SPEAKKIT_WORKER_INIT;
    const r = spawnSync(process.execPath, [worker], { env, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid type");
  });
});

describe("speech worker start-up", () => {
  // Raw TypeScript under node: its own import of the speech-range file must resolve, or the error would be a missing module and not the config message.
  it("fails with a readable message when its start-up config is missing a field", () => {
    const r = spawnSync(process.execPath, [sttWorker], { env: { ...process.env, SPEAKKIT_WORKER_INIT: '{"engine":"whisper"}' }, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("modelPath");
    expect(r.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });
});
