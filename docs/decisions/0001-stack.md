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

## Shared player, desktop library and reader (player-library)
| Choice | Why |
|---|---|
| `packages/player` (moved from the extension) | One gapless streaming core (FrameDecoder, lookahead, state machine, queue, seek, SoundTouch speed) for the extension offscreen document and the desktop reader. Depends on `@speakkit/protocol` and `@soundtouchjs/audio-worklet` only; the extension keeps its chrome.* glue. `X-SpeakKit-Replace` now carries a stream-group value `tab-<tabId>` (the desktop reader is group `tab-0`). `splitSentences` (Intl.Segmenter, abbreviations, clause cap, char spans) lives here too. |
| Speak proxy through main (`main/library/speak-proxy.ts`) | The renderer's origin is `file://`, which the server rejects by design (no Origin or `chrome-extension://` only). Main makes the request (no Origin, token added there, three allowed paths) and relays chunks over IPC; the renderer wraps it as a `fetch` so the player is unchanged. |
| lowdb 7 (MIT, 23 KB, pure JS) | Library index `library.json` with atomic writes (steno) and one JSON file per document body. Rejected: better-sqlite3 (native rebuild per Electron version), `electron-store` for bodies (one big file rewritten on every progress save). |
| `@mozilla/readability` 0.6 + `linkedom` 0.18 | Article extraction for web addresses and saved HTML (approved in package-audit.md for the desktop reader). linkedom (ISC, ~1 MB) instead of jsdom (5.5 MB, slow start); Readability runs on it. |
| `marked` 18 (lexer only) | Markdown to blocks; headings, lists, quotes and inline text without writing a parser. |
| `pdfjs-dist` 6 (Apache-2.0) | PDF text with positions in Node (legacy build) for layout-aware paragraphs (`pdf-layout.ts`: lines by baseline, paragraph gaps, heading by size, running header/footer removal, hyphen repair), and page rendering in the renderer for OCR. Used directly instead of `unpdf`, which only wraps it for serverless runtimes. |
| `mammoth` 1.13 (BSD-2) | DOCX to HTML (headings, paragraphs) then through the HTML reader. |
| `@lingo-reader/epub-parser` 0.4 (MIT, 160 KB, no native code) | EPUB spine and metadata; chapters go through the HTML reader. Rejected: `epubjs` (last publish 2023, needs a DOM). |
| `tesseract.js` 7 + `tesseract.js-core` 7 (Apache-2.0) | OCR for scanned PDFs, in the renderer, loaded by dynamic import only after the person agrees; language data comes from jsDelivr once (CSP `connect-src` allows only that host). `pnpm-workspace.yaml` sets its install script to false. |
| Own `SentenceClock` word estimate, `SleepTimer`, `ProgressSaver` | Kokoro gives no word timestamps; the word is estimated inside the sentence by character weight. The others are 15-line classes with tests, no package fits. |
| CSS Custom Highlight API for sentence, word and find highlights | Same as the extension; the text DOM never changes while reading. |

## Extension accessibility and UI integrity (extension polish agent)
| Choice | Why |
|---|---|
| `@axe-core/playwright` 4.14 (MPL-2.0, Deque, e2e dev dependency only) | WCAG 2.2 A/AA checks of every popup state, every options section, the side panel and the in-page UI (open Shadow DOM in test builds) in light and dark. Replaces writing contrast, name and role checks by hand. Rejected: pa11y and Lighthouse (they drive their own browser, not the extension build). |
| Own `layoutIssues` check (`e2e/support/ui-checks.ts`) | Sideways page scroll, elements wider than their container or the viewport, text cut off without an ellipsis, in open shadow roots. No package checks overflow of a given state; the check is 40 lines. |
| `scripts/sizes.mjs` + `src/budget.test.ts` | Real gzip sizes of a production build against the budgets (popup 120 KB, options 120 KB, side panel 100 KB, content.js 16 KB, content-ui.js 30 KB ...). `size-limit` was considered: it measures with its own bundler pass, not the Vite+ output that ships. |
| Options sections as one lazy chunk (`React.lazy`, `app/options/Sections.tsx`) | Options page went from 123.0 to 117.9 KB gzip of start-up JS. One chunk, not one per section: per-section dynamic imports made Rolldown move shared modules into chunks every page then loaded (popup +6 KB, side panel +26 KB). |

## System integration and packaging (desktop-system)
| Choice | Why |
|---|---|
| electron-builder 26.18 (devDependency) | NSIS installer, portable exe and the `latest.yml` that electron-updater reads, from one `electron-builder.yml`. Rejected: electron-forge (more moving parts, no update metadata for GitHub). `scripts/package.mjs` stages a plain app folder (`dist-app`) with a real `node_modules` first, because pnpm's symlinked tree does not survive packaging; the staged runtime packages are found by scanning the built files for bare imports, so a new dependency is picked up without editing a list. `asar: false`: the engine worker is its own Node process and loads kokoro-js, onnxruntime and koffi from disk. onnxruntime binaries of other platforms are deleted (about 140 MB). |
| electron-updater 6.8.11 | GitHub Releases provider, configured only in `electron-builder.yml`. Never forced: `autoDownload` and `autoInstallOnAppQuit` start false; "Restart now" and "Install when I quit" are the user's two choices. The state machine (`main/updates.ts`) is tested against a fake updater; a portable build or a source checkout reports "unsupported". |
| koffi 3.3.6 (MIT, N-API FFI, prebuilt, no compile) | Presses Ctrl+C in the focused app to read the selection (`keybd_event`, Alt and Shift released first so the app does not see Ctrl+Alt+C). Loaded on first use, so it costs nothing until a selection is read. Rejected: `@nut-tree-fork/nut-js` (large, many native parts), `robotjs` (unmaintained, rebuild per Electron version), PowerShell `SendKeys` (spawn per press, cannot release Alt, which would trigger our own Ctrl+Alt+C), `uiohook-napi` (hooks every key press system-wide, which is more than needed and a privacy cost). |
| wasm-media-encoders 0.7.0 (MIT; LAME as WebAssembly) | MP3 export in a `worker_threads` worker, so the window stays responsive; measured: 10 minutes of speech encode in 1.4 s. Rejected: `lamejs` / `@breezystack/lamejs` (LGPL-3 JavaScript bundled into the app, slower), ffmpeg.wasm (30 MB), native LAME bindings (compile step). LAME's LGPL applies to the wasm; it stays a separate package file in `node_modules`, listed under Settings > About. |
| Electron built-ins: `globalShortcut`, `Notification`, `Tray`, `clipboard` (promise based since Electron 45), `dialog`, `shell`, `app.setLoginItemSettings` | Global shortcuts, toasts, tray, clipboard snapshot/restore, folder picker, "show in folder" and start at sign-in need no package. |
| Own code: `ShortcutRegistry` + recorder rules, `ToastCenter`, `ClipboardWatcher`, `ReaderController`, `ChunkPlayer`, `ExportJobs`, `Updates` | Each is 50 to 150 lines, testable without Electron, and no maintained package fits: shortcut-recorder packages are React-only or unmaintained and none know Electron's accelerator rules or conflicts; toast packages duplicate `Notification`; the controller and player are specific to sentence streaming from this server. |
| `parseWav` reused from `@speakkit/engine` | The export path decodes the server's WAV with the engine's existing parser instead of a second one. |

## Integration and QA (v0.2.0)

| Choice | Why |
|---|---|
| Wire schemas live in `@speakkit/protocol` (`schemas.ts`, valibot, typed `v.GenericSchema<unknown, T>`) | The extension and the desktop app each carried a hand-copied health schema; the extension's one rejected the `installing` and `unavailable` engine states, so a valid `/v1/health` during a Chatterbox install looked like "app not running". One schema per response, compiler-checked against the interfaces. `apiVersion` parses as any number so a client can report a version mismatch. |
| `node:net` `BlockList` + `node:dns` for the library's URL fetch | Refuses loopback, private, link-local and CGNAT addresses on every redirect hop (redirects are followed by hand, at most 5). No package needed. Limit: the check resolves the name once and `fetch` resolves it again, so a DNS rebinding answer between the two is not stopped. |
| knip 5.88 (run with `pnpm dlx`, config in `code/knip.json`) | Finds unused files, exports and dependencies; wired into CI. Not a devDependency: knip 5 needs the JavaScript TypeScript API and the workspace uses tsrs/TypeScript 7. Used once to un-export about 180 names nobody imported. Rejected: ts-prune (unmaintained), depcheck (no export analysis). |
| Test switches only in unpackaged apps (`apps/desktop/src/main/test-env.ts`) | `SPEAKKIT_FAKE_UPDATE`, `SPEAKKIT_TOKEN`, `SPEAKKIT_TEST` and the library's local-URL allowance are ignored by a packaged app, so an environment variable in the user's session cannot swap the updater or fix the token. `SPEAKKIT_ENGINE`, `_USER_DATA` and `_PORT` stay: the packaged smoke test uses them. |
| Extension pinning is opt-in (`allowedExtensions` option, env `SPEAKKIT_EXTENSION_IDS`) | Any extension that knows the token can call the server; pinning the default to one id would break a user who has the store build and an unpacked build, or two browsers. The token stays the gate by default. |
| Own router table (`packages/server/src/router.ts`) | The route handlers (`routes/*.ts`) are data, 404 and 405 come from one function. Rejected: express/fastify/hono (a dependency and a startup cost for 20 routes; the server is lazy-loaded and measured in microseconds per request). |
