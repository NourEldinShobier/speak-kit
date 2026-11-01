// Standalone server. From source: node --import ./register.mjs src/cli.ts. Packed: node dist/cli.js (pnpm exec vp pack).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as v from "valibot";
import { DEFAULT_PORT } from "@speakkit/protocol";
import { FakeEngine, KokoroEngine, type TtsEngine } from "@speakkit/engine";
import { parseEnv } from "./config";
import { createChatterbox } from "./chatterbox";
import { createServer } from "./server";

let env;
try {
  env = parseEnv();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const dataDir =
  env.SPEAKKIT_DATA_DIR ??
  join(process.env.APPDATA ?? join(homedir(), ".config"), "SpeakKit");
const { version } = v.parse(v.object({ version: v.string() }), JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));

let engine: TtsEngine;
if ((env.SPEAKKIT_ENGINE ?? "kokoro") === "fake") {
  const state = env.SPEAKKIT_FAKE_STATE;
  const failOn = env.SPEAKKIT_FAKE_FAIL_ON;
  const fake = new FakeEngine({
    latencyMs: env.SPEAKKIT_FAKE_LATENCY_MS ?? 0,
    loadMs: env.SPEAKKIT_FAKE_LOAD_MS ?? 0,
    state,
    failOn: failOn ? (t) => t.includes(failOn) : false,
  });
  // Stay in a pinned error-ish state; "unloaded" and "ready" are normal lifecycle states.
  if (state && state !== "unloaded" && state !== "ready") fake.start = async () => {};
  engine = fake;
} else {
  // A bare path or a file: URL. Needed when this file is bundled away from the worker.
  const w = env.SPEAKKIT_WORKER_URL;
  engine = new KokoroEngine({
    modelsDir: env.SPEAKKIT_MODELS_DIR ?? join(dataDir, "models"),
    threads: env.SPEAKKIT_THREADS,
    dtype: env.SPEAKKIT_DTYPE,
    device: env.SPEAKKIT_DEVICE,
    isolation: env.SPEAKKIT_ISOLATION,
    workerUrl: w ? (/^[a-z]+:\/\//i.test(w) ? w : pathToFileURL(w)) : undefined,
  });
}

// Optional engine; the hardware probe takes well under a second. Off for the fake engine and with SPEAKKIT_CHATTERBOX=off.
const chatterbox =
  (env.SPEAKKIT_ENGINE ?? "kokoro") === "kokoro" && env.SPEAKKIT_CHATTERBOX !== "off"
    ? await createChatterbox(dataDir, { sidecarScript: env.SPEAKKIT_CHATTERBOX_SCRIPT })
    : undefined;

const server = createServer({
  engine,
  chatterbox,
  dataDir,
  port: env.SPEAKKIT_PORT ?? DEFAULT_PORT,
  version,
});
try {
  await server.listen();
} catch (e) {
  console.error(`cannot listen: ${(e as Error).message}`);
  process.exit(1);
}
// stdout carries exactly this one line; everything else goes to stderr.
console.log(JSON.stringify({ port: server.port, token: server.token }));

// Lazy by default: only a missing model is fetched at boot (createServer handles loadAtStart).
if (engine.status().state === "missing")
  engine.start().catch((e) => console.error(`engine failed: ${(e as Error).message}`));

const stop = async () => {
  await server.close();
  await Promise.all([engine.close(), chatterbox?.close()]);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
