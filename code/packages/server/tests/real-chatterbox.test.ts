import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { FrameDecoder, type ClonedVoice, type EngineList, type ExportJob } from "@speakkit/protocol";
import { KokoroEngine, parseWav } from "@speakkit/engine";
import { clip } from "../../engine/tests/clip-fixture";
import { createChatterbox, createServer } from "../src";

// Opt-in: SPEAKKIT_REAL_CHATTERBOX=1. The whole product path on a real NVIDIA GPU: install (when missing), select, speak, export, clone,
// idle unload, switch back to Kokoro. Needs the Kokoro model in SPEAKKIT_MODELS_DIR and about 8 GB of downloads on the first run.
// SPEAKKIT_CHATTERBOX_DATA_DIR is a data directory (engine files are in <dir>/engines/chatterbox); reuse one between runs.
// Measurements are written to <dir>/server-metrics.json (the runner hides console output of passing tests).
const dataDir = process.env.SPEAKKIT_CHATTERBOX_DATA_DIR ?? "D:/workspaces/speak-it/code/.cache/chatterbox-data";
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? "D:/workspaces/speak-it/code/.cache/models";
const IDLE_MS = 8000;
const SENTENCE = "This is a short test sentence for the speech engine.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vramMb = () => Number(execFileSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { encoding: "utf8" }).trim().split("\n")[0]);
const ms = (t: number) => Math.round(performance.now() - t);
const gone = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};
/** The engine reports "unloaded" before its process has finished exiting; wait for the process. */
async function exited(pid: number, limitMs = 15_000): Promise<number> {
  const t = performance.now();
  while (!gone(pid) && ms(t) < limitMs) await sleep(100);
  expect(gone(pid)).toBe(true);
  return ms(t);
}

/** Reads a /v1/speak stream to its end; `firstAudioMs` is the time from the request to the first audio frame. */
async function readStream(res: Response, t0: number) {
  const dec = new FrameDecoder();
  const reader = res.body!.getReader();
  const out = { types: [] as string[], peak: 0, samples: 0, firstAudioMs: -1 };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    for (const f of dec.push(value)) {
      out.types.push(f.header.type);
      if (f.header.type !== "audio") continue;
      if (out.firstAudioMs < 0) out.firstAudioMs = ms(t0);
      out.samples += f.pcm!.length;
      for (const v of f.pcm!) out.peak = Math.max(out.peak, Math.abs(v));
    }
  }
}

describe.runIf(process.env.SPEAKKIT_REAL_CHATTERBOX)("Chatterbox through the server (real GPU)", () => {
  it("selects, speaks, exports, clones, unloads when idle and gives the GPU back when Kokoro is selected", async () => {
    mkdirSync(dataDir, { recursive: true });
    const kokoro = new KokoroEngine({ modelsDir });
    const cb = await createChatterbox(dataDir, { idleUnloadMs: IDLE_MS });
    const server = createServer({ engine: kokoro, chatterbox: cb, dataDir, port: 0 });
    await server.listen();
    const base = `http://127.0.0.1:${server.port}`;
    const headers = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
    const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers, body: body === undefined ? null : JSON.stringify(body) });
    const speak = async (voice: string, sentences: string[]) => {
      const t0 = performance.now();
      return readStream(await call("POST", "/v1/speak", { sentences, voice, speed: 1 }), t0);
    };
    const m: Record<string, number> = {};
    try {
      if (cb.status().state === "missing") {
        const t = performance.now();
        await call("POST", "/v1/engines/chatterbox/install");
        while (cb.status().state === "installing") await sleep(2000);
        m.installMs = ms(t);
      }
      expect(cb.status().state).toBe("unloaded");
      m.vramBaseMb = vramMb();

      // Selecting does not load.
      const sel = (await (await call("POST", "/v1/engines/select", { id: "chatterbox" })).json()) as EngineList;
      expect(sel.active).toBe("chatterbox");
      expect(cb.sidecarPid).toBeUndefined();
      const residualBeforeLoadMb = vramMb() - m.vramBaseMb;
      expect(residualBeforeLoadMb).toBeLessThan(300);

      // Cold request: spawn, import, weights to the GPU, then audio.
      const cold = await speak("chatterbox", [SENTENCE]);
      expect(cold.types).toEqual(["audio", "done"]);
      expect(cold.peak).toBeGreaterThan(1000);
      m.coldFirstAudioMs = cold.firstAudioMs;
      m.vramLoadedMb = vramMb();
      expect(m.vramLoadedMb - m.vramBaseMb).toBeGreaterThan(1500);
      const warm = await speak("chatterbox", [SENTENCE]);
      m.warmFirstAudioMs = warm.firstAudioMs;
      m.warmAudioMs = Math.round((warm.samples / 24000) * 1000);

      // Export a WAV through the job API.
      const job = (await (await call("POST", "/v1/export", { sentences: [SENTENCE, "A second sentence follows the first."], voice: "chatterbox", speed: 1 })).json()) as ExportJob;
      let state = job;
      const tExport = performance.now();
      while (state.state === "running") {
        await sleep(500);
        state = (await (await call("GET", `/v1/export/${job.id}`)).json()) as ExportJob;
      }
      m.exportMs = ms(tExport);
      expect(state.state).toBe("done");
      const wav = parseWav(Buffer.from(await (await call("GET", `/v1/export/${job.id}/audio`)).arrayBuffer()));
      expect(wav.sampleRate).toBe(24000);
      expect(wav.samples.length / wav.sampleRate).toBeGreaterThan(3);
      m.exportSeconds = Math.round((wav.samples.length / wav.sampleRate) * 10) / 10;

      // Clone from a generated 8 s clip and speak with the cloned voice.
      const reference = clip(8);
      const t = performance.now();
      const made = await call("POST", "/v1/voices/clone", { name: "Generated tone", consent: true, audio: Buffer.from(reference).toString("base64") });
      expect(made.status).toBe(201);
      const voice = (await made.json()) as ClonedVoice;
      const cloned = await speak(voice.id, [SENTENCE]);
      m.cloneAndSpeakMs = ms(t);
      expect(cloned.types).toEqual(["audio", "done"]);
      expect(cloned.peak).toBeGreaterThan(1000);

      // Rename the voice and give it a style (the cloning screens do both): the model must accept exaggeration and cfg_weight and speak.
      const styled = await call("PATCH", `/v1/voices/${voice.id}`, { name: "Styled tone", exaggeration: 0.9, pace: 0.2 });
      expect(styled.status).toBe(200);
      expect(await styled.json()).toMatchObject({ id: voice.id, name: "Styled tone", exaggeration: 0.9, pace: 0.2 });
      const dramatic = await speak(voice.id, [SENTENCE]);
      expect(dramatic.types).toEqual(["audio", "done"]);
      expect(dramatic.peak).toBeGreaterThan(1000);
      m.clonedNeutralSamples = cloned.samples;
      m.clonedStyledSamples = dramatic.samples;
      await call("DELETE", `/v1/voices/${voice.id}`);

      // Idle unload: the sidecar exits and the GPU memory is returned.
      const pid1 = cb.sidecarPid!;
      const tIdle = performance.now();
      while (cb.status().state === "ready" && ms(tIdle) < IDLE_MS * 4) await sleep(250);
      m.idleUnloadAfterMs = ms(tIdle);
      expect(cb.status().state).toBe("unloaded");
      m.idleExitAfterUnloadMs = await exited(pid1);
      await sleep(1000);
      m.vramAfterIdleMb = vramMb();
      expect(m.vramAfterIdleMb - m.vramBaseMb).toBeLessThan(400);

      // Reload on demand, then switch to Kokoro: the sidecar must end and the GPU must be free.
      const again = await speak("chatterbox", ["Back after an idle unload."]);
      expect(again.types).toEqual(["audio", "done"]);
      const pid2 = cb.sidecarPid!;
      expect(pid2).not.toBe(pid1);
      const back = (await (await call("POST", "/v1/engines/select", { id: "kokoro" })).json()) as EngineList;
      expect(back.active).toBe("kokoro");
      expect(cb.status().state).toBe("unloaded");
      m.switchExitMs = await exited(pid2);
      await sleep(1000);
      m.vramAfterSwitchMb = vramMb();
      expect(m.vramAfterSwitchMb - m.vramBaseMb).toBeLessThan(400);
      const k = await speak("af_heart", ["Kokoro again."]);
      expect(k.types).toEqual(["audio", "done"]);
      m.kokoroFirstAudioMs = k.firstAudioMs;
    } finally {
      writeFileSync(join(dataDir, "server-metrics.json"), JSON.stringify(m, null, 2));
      await server.close();
      await Promise.all([kokoro.close(), cb.close()]);
    }
  }, 3_600_000);
});
