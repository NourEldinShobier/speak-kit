# 0001 — Stack

Date: 2026-11-01 · Status: accepted

## Rule
Use what the platform and Vite+ already provide. Add a package only when nothing built-in covers it, and record why here.

## Built in (no package)
| Need | Use |
|---|---|
| Dev server, build, test, lint, format, tasks | Vite+ (`vp`): Vite 8, Rolldown, Vitest, Oxlint, Oxfmt |
| Loopback HTTP server, streaming | `node:http`, chunked responses |
| Sentence splitting | `Intl.Segmenter` |
| Highlighting without DOM changes | CSS Custom Highlight API |
| Gapless playback | Web Audio (`AudioContext`) in an offscreen document |
| Type checking | tsrs (Rust port of TypeScript 7), `tsc` as fallback |

## Packages and why
| Package | Why |
|---|---|
| electron | desktop shell, tray, single-instance |
| react, react-dom | UI library (popup, options, side panel, desktop renderer; not in content scripts) |
| @tabler/icons-react | the icon set in the Lumen designs (stroke 1.5) |
| kokoro-js, onnxruntime-node | Kokoro-82M inference in Node (worker thread) |
| @playwright/test, pixelmatch, pngjs | end-to-end and visual tests; extensions need a real browser |
| @vitejs/plugin-react | JSX transform for Vite |

## Not chosen
Express/Hono (a loopback API with four routes needs `node:http`), a CSS-in-JS library (tokens are CSS variables), Redux (state lives in the player and the service worker).

## Server validation and build (engine-server)
| Choice | Why |
|---|---|
| valibot (server) | request bodies, env and options in `packages/server/src/config.ts`; small, tree-shakeable, bundled into `dist` so the packaged server has no extra install. Error bodies are unchanged: the first failing field maps to the old message. |
| `vp pack` (tsdown) for engine and server | emits `dist/*.js` with the worker thread entry as a separate file; no extra build tool. |
| Own `LifecycleEngine` (idle unload, hold, warm) | no maintained package does idle unload of an onnxruntime worker thread; the logic is about 200 lines and tested with short timers. |
| Not added: `p-queue` / semaphore packages | the stream cap is a 20-line FIFO that also needs cancellation of queued entries. |

## Desktop app (apps/desktop)
| Choice | Why |
|---|---|
| electron-store 12 | `config.json` with atomic writes; contents validated with valibot (bad fields fall back to defaults), replaces the hand-written read/write |
| electron-log 5 (`electron-log/main`) | `<userData>/logs/main.log`, rotated at 1 MB to `main.old.log`, uncaught errors captured |
| valibot (desktop) | config schema and every IPC argument tuple (`shared/schemas.ts`), checked in main before a handler runs |
| `@speakkit/ui` (Lumen components, Radix underneath) | the desktop renderer no longer has its own Button/Toggle/Badge; only layout CSS (`shell.css`) |
| `node:diagnostics_channel` (`http.server.request.start`) | detects the extension's first authenticated call for "Test connection" without a hook in the server package |
| Electron `Tray`, `Notification`, `powerMonitor`, `app.setAsDefaultProtocolClient` | built in; no tray, toast or auto-launch package needed |

## Chatterbox, cloning, export and text normalization (engine-server)
| Choice | Why |
|---|---|
| Chatterbox as a Python sidecar (`chatterbox-tts` in a private virtualenv, JSON lines on stdin/stdout), not ONNX in Node | The ONNX exports (`ResembleAI/chatterbox-turbo-ONNX`, `onnx-community/chatterbox-multilingual-ONNX`, wrapper `streamtts`) target Transformers.js v4 in the browser, need hand-written sampling and tokenization loops in Node, are int4-quantized (quality loss), and none is maintained for onnxruntime-node. The PyTorch package is the reference, has voice cloning and exaggeration, and runs on the CUDA GPU. Cost: Python 3.10 to 3.12 and about 2.4 GB of downloads, which is why the engine is optional, hardware-gated and installed on request. The sidecar exists only while the model is loaded (killed on idle unload and on switching to Kokoro). An ONNX path can replace the sidecar later behind the same `TtsEngine` interface. |
| Hardware probes: `nvidia-smi` and `python3.x --version` through `execFile` | No package needed. onnxruntime execution providers say nothing about NVIDIA VRAM or about Python. |
| Chatterbox install: `python -m venv` + `pip install chatterbox-tts` (no wrapper package) | Progress is approximate (counts pip's "Collecting" lines); weights are fetched by the sidecar on first load through `huggingface_hub.snapshot_download` with a tqdm callback, reported as `downloading`. |
| valibot (engine) | the cloned-voice index and the sidecar's message lines are parsed, not cast. Already used by the server. |
| `number-to-words` 1.2.5 (+ `@types/number-to-words`), engine | MIT, tiny, cardinals and ordinals. Used only for engines that do not read digits (Chatterbox). No maintained English TTS text normalizer exists on npm (searched 2026-11-01: only Turkish and Vietnamese ones, and Whisper-style normalizers that go the other way), so the rest of `normalizeText` is own code with 29 tests. Kokoro keeps digits as they are: its phonemizer (espeak) already reads integers, ordinals, percent, times and years, see perf.md "Text normalization". |
| WAV parsing/encoding and clip quality checks (`chatterbox/wav.ts`, `clip.ts`) | A 60-line RIFF reader (PCM 8/16/24/32, float, any channels) and level/silence/noise statistics; WAV packages add 100+ KB for formats we reject anyway. No ASR or diarization model runs, so "single speaker" is not checked. |
| Export as a job (`POST /v1/export`, then poll and download) writing a temp WAV | A streamed WAV needs its length in the header; rendering to `<dataDir>/exports/<id>.wav` and patching the header at the end gives a correct file, progress, cancel and no memory growth. MP3 encoding stays in the desktop. |
