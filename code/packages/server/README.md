# @speakkit/server

Loopback HTTP server for SpeakKit (`node:http` only). Contract: `docs/architecture.md` and `packages/protocol`.

## Run standalone

From `code/packages/server`:

```
pnpm start                                   # real Kokoro engine
SPEAKKIT_ENGINE=fake pnpm start              # instant fake engine (sine tones), for tests
```

which runs `node --import ./register.mjs src/cli.ts`. `register.mjs` lets plain Node load the workspace TypeScript sources (they use extensionless imports). Node 24 or newer.

Once listening, stdout gets exactly one line, `{"port":47615,"token":"<64 hex chars>"}`. Logs and errors go to stderr. The engine loads in the background: poll `GET /v1/health` until `engine.state` is `ready` (`downloading` with `progress` 0..1, then `loading`). SIGINT/SIGTERM shut down cleanly. If the port is taken the process prints the reason to stderr and exits 1.

PowerShell example (own port, shared model cache, throwaway data dir):

```
$env:SPEAKKIT_PORT = "47700"; $env:SPEAKKIT_DATA_DIR = "$env:TEMP\speakkit-dev"
$env:SPEAKKIT_MODELS_DIR = "D:\workspaces\speak-it\code\.cache\models"
pnpm start
```

## Environment

| Variable                   | Default                                   | Meaning                                                                                                 |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SPEAKKIT_PORT`            | `47615`                                   | Listen port; `0` picks a free one (read it from the JSON line)                                          |
| `SPEAKKIT_DATA_DIR`        | `%APPDATA%\SpeakKit`                      | Holds `token` (and `models/` unless overridden)                                                         |
| `SPEAKKIT_TOKEN`           | generated, persisted in `<dataDir>/token` | Fixed token (not persisted)                                                                             |
| `SPEAKKIT_ENGINE`          | `kokoro`                                  | `kokoro` or `fake`                                                                                      |
| `SPEAKKIT_MODELS_DIR`      | `<dataDir>/models`                        | Model cache; first run downloads about 180 MB from Hugging Face (`onnx-community/Kokoro-82M-v1.0-ONNX`) |
| `SPEAKKIT_DTYPE`           | `uint8`                                   | `uint8`, `fp32` or `q8` (see `docs/perf.md`; `q8` is slow here)                                         |
| `SPEAKKIT_THREADS`         | `6`                                       | onnxruntime intra-op threads                                                                            |
| `SPEAKKIT_DEVICE`          | `cpu`                                     | `dml` is selectable but fails on this model (see `docs/perf.md`)                                        |
| `SPEAKKIT_FAKE_LATENCY_MS` | `0`                                       | Fake engine: delay per sentence                                                                         |
| `SPEAKKIT_FAKE_FAIL_ON`    | unset                                     | Fake engine: sentences containing this text fail with a `synthesis-failed` frame                        |
| `SPEAKKIT_FAKE_STATE`      | `ready`                                   | Fake engine: `missing`, `downloading`, `loading` or `error` and stay there                              |

## API behaviour

- `Host` must be `127.0.0.1:<port>` or `localhost:<port>`, and `Origin` absent or `chrome-extension://*`; otherwise `403` (also for `OPTIONS`). Preflight answers `204` with CORS headers for extension origins only.
- Everything except `GET /v1/health` needs `Authorization: Bearer <token>`; wrong or missing gives `401 {"error":{"code":"token-rejected",...}}`.
- `POST /v1/speak` validation failures give `400 {"error":{"code":"invalid-request","message":...}}` (bad JSON, sentences not 1..500 non-blank strings of at most 2000 chars, unknown voice, speed outside 0.5..3). Bodies over 2 MB give `413`.
- A valid request always answers `200` with the frame stream. When the engine is not ready the stream is a single `error` frame with code `engine-not-ready`; a failure mid-stream ends with an `error` frame (`synthesis-failed`) after the audio frames already sent. Closing the connection cancels the remaining synthesis.
- Deadlines (options `controlDeadlineMs`, `streamIdleMs`): every route except `/v1/speak` answers within 8 s or fails with `504 {"error":{"code":"internal",...}}`. A speak stream that produces no frame for 30 s ends with a `synthesis-failed` frame; a model that is still loading or downloading does not count, and neither does time spent waiting for a slot.
- Slots: at most `maxStreams` (default 2) syntheses run at once. Exports use the background lane and never take the last slot, so a long export cannot delay a read; a read may use every slot. With one slot, exports use it.
- A corrupt or invalid `engine.json` is moved to `engine.json.bad` and Kokoro stays selected.
- The model speed is `min(speed, 2)`; the player applies the rest as `playbackRate`.

## Embedding

```ts
import { createServer } from "@speakkit/server";
import { KokoroEngine } from "@speakkit/engine";
const engine = new KokoroEngine({ modelsDir });
const server = createServer({ engine, dataDir, port: 47615, version });
await server.listen();
engine.start(); // background; health reports progress
```

`server.close()` does not close the engine. `KokoroEngine` starts `worker.ts` (or `worker.js`) next to its own module; when you bundle the engine, ship the worker as a separate file and pass `workerUrl`. The worker needs `kokoro-js` resolvable from where the worker file lives.

## Tests

- `pnpm exec vp test` runs the fake-engine suites (frames, auth/Origin/Host, abort, validation, health).
- `pnpm run test:real` runs the opt-in real-model suites of engine and server (`SPEAKKIT_REAL=1`).
- `pnpm run bench` runs the benchmark described in `docs/perf.md`.
