# 0001 — Stack

Date: 2026-11-01 · Status: accepted · Label: [D] · Review by: 2026-12-27

This record predates the numbered ADR process and keeps its per-area sections. New decisions are `NNNN-slug.md` files written from `TEMPLATE.md`; each package choice is added here as a row and names the ADR when one exists. Intake notes for new tools use `INTAKE-TEMPLATE.md`. Labels used in this repo: [D] decided, [S] spike-reversible with a numeric exit test, [Q] user question, [est.] estimate.

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
| Property tests | fast-check (dev dependency, MIT), see ADR 0003 |

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
| Chatterbox install: `uv venv --python 3.11` + `uv pip install` (uv found on PATH or as `python -m uv`), else `python -m venv` + pip with a system Python 3.10 to 3.12; no wrapper package | uv downloads a managed Python 3.11 by itself, so a machine with only Python 3.13 or 3.14 (this one) can still install; `python-missing` is reported only when neither uv nor a supported Python exists. Three install facts found by running it for real (2026-11-01): `chatterbox-tts` pins `torch==2.6.0`, which PyPI ships CPU-only on Windows, so torch and torchaudio are installed first from `https://download.pytorch.org/whl/cu124`; `perth` (the watermarker chatterbox loads) imports `pkg_resources`, so `setuptools<81` is installed too (without it `PerthImplicitWatermarker` is `None` and loading fails with `TypeError`); `chatterbox-tts` 0.1.7 pins `transformers==5.2.0`. The sidecar sets `HF_HUB_DISABLE_XET=1`: `huggingface_hub` 1.x downloads through hf-xet, which reports no byte progress for minutes and tripped the 120 s watchdog on a real run (2026-11-07, ADR 0016); an install first checks for 10 GB of free disk space. Progress is approximate (counts resolved packages); weights are fetched by the sidecar on first load through `huggingface_hub.snapshot_download(allow_patterns=...)` limited to the five files `ChatterboxTTS` reads (the repository holds about 12 GB), with a tqdm callback, reported as `downloading`. |
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
| `@axe-core/playwright` 4.14 (MPL-2.0, Deque, e2e dev dependency only) | WCAG 2.2 A/AA checks of every popup state, every options section, the side panel and the in-page UI (open Shadow DOM in test builds) in light (dark was dropped, ADR 0015). Replaces writing contrast, name and role checks by hand. Rejected: pa11y and Lighthouse (they drive their own browser, not the extension build). |
| Own `layoutIssues` check (`e2e/support/ui-checks.ts`) | Sideways page scroll, elements wider than their container or the viewport, text cut off without an ellipsis, in open shadow roots. No package checks overflow of a given state; the check is 40 lines. |
| `scripts/sizes.mjs` + `src/budget.test.ts` | Real gzip sizes of a production build against the budgets (popup 123 KB, options 123 KB (each raised from 120 KB for the Voice hub logo paths, about 2 KB gzip), side panel 100 KB, content.js 16 KB, content-ui.js 30 KB ...). `size-limit` was considered: it measures with its own bundler pass, not the Vite+ output that ships. |
| Options sections as one lazy chunk (`React.lazy`, `app/options/Sections.tsx`) | Options page went from 123.0 to 117.9 KB gzip of start-up JS. One chunk, not one per section: per-section dynamic imports made Rolldown move shared modules into chunks every page then loaded (popup +6 KB, side panel +26 KB). |

## System integration and packaging (desktop-system)
| Choice | Why |
|---|---|
| electron-builder 26.18 (devDependency) | NSIS installer, portable exe and the `latest.yml` that electron-updater reads, from one `electron-builder.yml`. Rejected: electron-forge (more moving parts, no update metadata for GitHub). `scripts/package.mjs` stages a plain app folder (`dist-app`) with a real `node_modules` first, because pnpm's symlinked tree does not survive packaging; the staged runtime packages are found by scanning the built files for bare imports, so a new dependency is picked up without editing a list. `asar: false`: the engine worker is its own Node process and loads kokoro-js, onnxruntime and koffi from disk. onnxruntime binaries of other platforms are deleted (about 140 MB). Fuses: see ADR 0013. |
| @electron/fuses 1.8.0 (devDependency of `apps/desktop`) | Flips the Electron fuses of the packed app in `scripts/after-pack.cjs` and reads them back in `scripts/smoke-packaged.mjs`. MIT, maintained by the Electron project, already installed through electron-builder. Chosen over electron-builder's `electronFuses` option because that option runs after `afterPack`, which would invalidate the ad-hoc macOS signature made there. |
| electron-updater 6.8.11 | GitHub Releases provider, configured only in `electron-builder.yml`. Never forced: `autoDownload` and `autoInstallOnAppQuit` start false; "Restart now" and "Install when I quit" are the user's two choices. The state machine (`main/updates.ts`) is tested against a fake updater; a portable build or a source checkout reports "unsupported". |
| koffi 3.3.6 (MIT, N-API FFI, prebuilt, no compile) | Presses Ctrl+C in the focused app to read the selection (`keybd_event`, Alt and Shift released first so the app does not see Ctrl+Alt+C). Loaded on first use, so it costs nothing until a selection is read. Rejected: `@nut-tree-fork/nut-js` (large, many native parts), `robotjs` (unmaintained, rebuild per Electron version), PowerShell `SendKeys` (spawn per press, cannot release Alt, which would trigger our own Ctrl+Alt+C), `uiohook-napi` (hooks every key press system-wide, which is more than needed and a privacy cost). |
| wasm-media-encoders 0.7.0 (MIT; LAME as WebAssembly) | MP3 export in a `worker_threads` worker, so the window stays responsive; measured: 10 minutes of speech encode in 1.4 s. Rejected: `lamejs` / `@breezystack/lamejs` (LGPL-3 JavaScript bundled into the app, slower), ffmpeg.wasm (30 MB), native LAME bindings (compile step). LAME's LGPL applies to the wasm; it stays a separate package file in `node_modules`, listed under Settings > About. |
| Electron built-ins: `globalShortcut`, `Notification`, `Tray`, `clipboard` (promise based since Electron 45), `dialog`, `shell`, `app.setLoginItemSettings` | Global shortcuts, toasts, tray, selection capture (clipboard snapshot/restore), folder picker, "show in folder" and start at sign-in need no package. |
| Own code: `ShortcutRegistry` + recorder rules, `ToastCenter`, `ReaderController`, `ChunkPlayer`, `ExportJobs`, `Updates` | Each is 50 to 150 lines, testable without Electron, and no maintained package fits: shortcut-recorder packages are React-only or unmaintained and none know Electron's accelerator rules or conflicts; toast packages duplicate `Notification`; the controller and player are specific to sentence streaming from this server. |
| `parseWav` reused from `@speakkit/engine` | The export path decodes the server's WAV with the engine's existing parser instead of a second one. |

## Integration and QA (v0.2.0)

| Choice | Why |
|---|---|
| Wire schemas live in `@speakkit/protocol` (`schemas.ts`, valibot, typed `v.GenericSchema<unknown, T>`) | The extension and the desktop app each carried a hand-copied health schema; the extension's one rejected the `installing` and `unavailable` engine states, so a valid `/v1/health` during a Chatterbox install looked like "app not running". One schema per response, compiler-checked against the interfaces. `apiVersion` parses as any number so a client can report a version mismatch. |
| `node:net` `BlockList` + undici 7 `Agent` with a `connect.lookup` for the library's URL fetch (`apps/desktop/src/main/library/public-fetch.ts`) | Refuses loopback, private, link-local and CGNAT addresses. IP literals are checked before the request; names are resolved once, inside the socket's `lookup`, and the socket connects to the address that was checked, so there is no DNS rebinding window (test: a resolver that answers a private address first and a public one second is asked once and never connected to). Redirects are followed by hand (at most 5) and every hop goes through the same fetch. undici (MIT, maintained by the Node.js project, already in the lockfile through other packages) is added as a direct dependency of the desktop app because the global `fetch` cannot take a custom dispatcher without it. Rejected: `request-filtering-agent` and `ssrf-req-filter` (agents for `node:http`, which has no `fetch` and no automatic decompression). |
| knip 5.88 (run with `pnpm dlx`, config in `code/knip.json`) | Finds unused files, exports and dependencies; wired into CI. Not a devDependency: knip 5 needs the JavaScript TypeScript API and the workspace uses tsrs/TypeScript 7. Used once to un-export about 180 names nobody imported. Rejected: ts-prune (unmaintained), depcheck (no export analysis). |
| Test switches only in unpackaged apps (`apps/desktop/src/main/test-env.ts`) | `SPEAKKIT_FAKE_UPDATE`, `SPEAKKIT_TOKEN`, `SPEAKKIT_TEST` and the library's local-URL allowance are ignored by a packaged app, so an environment variable in the user's session cannot swap the updater or fix the token. `SPEAKKIT_ENGINE`, `_USER_DATA` and `_PORT` stay: the packaged smoke test uses them. |
| Test-only code removed at build time (`__TEST_CODE__` define in `apps/desktop/node-build.ts`) | The fake updater is imported by `desktop.ts` behind `__TEST_CODE__ &&`; `scripts/package.mjs` builds with `SPEAKKIT_PACKAGE=1`, which defines it as `false`, and the bundler drops the module. `tests/bundle.test.ts` builds both variants and asserts the shipped one has no `fakeUpdater`. No package: Vite `define`. |
| Extension pinning is opt-in (`allowedExtensions` option, env `SPEAKKIT_EXTENSION_IDS`) | Any extension that knows the token can call the server; pinning the default to one id would break a user who has the store build and an unpacked build, or two browsers. The token stays the gate by default. |
| Own router table (`packages/server/src/router.ts`) | The route handlers (`routes/*.ts`) are data, 404 and 405 come from one function. Rejected: express/fastify/hono (a dependency and a startup cost for 20 routes; the server is lazy-loaded and measured in microseconds per request). |

## Extension and UI tests (extension-ui agent)

| Choice | Why |
|---|---|
| `linkedom` 0.18 as a devDependency of `apps/extension` and `packages/ui` | Component tests of the popup, side panel, queue panel, options sections and the in-page launcher run under `vp test` without a browser: React renders into a linkedom document (`apps/extension/src/testing/dom.tsx`), events are dispatched and the result is read from the DOM. Already approved and in the lockfile for the desktop reader. The helper patches the three things linkedom lacks that React needs (`input.type`, `oninput` on the document, a `react-dom/client` loaded after the DOM exists). Layout, focus and pointer capture are not simulated: those stay in the Chromium suites (`content.test.ts`, Playwright). Rejected: jsdom (5.5 MB, slow start, a second DOM library), happy-dom (a third). |
| The same linkedom document for vanilla-vs-React parity (`packages/ui/tests/parity.test.tsx`) | The vanilla builders write DOM and the React components write a string; both are reduced to one canonical string and compared, in milliseconds, instead of building the gallery and driving Chromium. |
| `src/tokens.ts` generated from `lumen.css` (`packages/ui/scripts/gen-tokens.ts`, `pnpm --filter @speakkit/ui gen:tokens`) | One source for colours: the stylesheet. The module serves code that cannot read CSS variables (the toolbar badge, the highlight palette on pages without Lumen, Electron window colours). `tests/tokens.test.ts` fails when the file is stale, when a `var(--x)` has no definition, and when a hex colour appears outside `lumen.css`, `tokens.ts` and the highlight swatches. No package: a 40-line script. |
| One sentence splitter, in `@speakkit/player/sentences` | The extension's extractor had its own copy (batched, more abbreviations, conjunction cuts); it moved into the player package and the extension and the desktop reader share it. |
| Formatter: oxfmt through `vp fmt` (already part of Vite+) | No new package. The config under `fmt` in `code/vite.config.ts` uses `printWidth: 200`, the width that left the fewest files changed against the existing hand-written code (160 changed 318 of 503 files, 200 changed 294, before line endings were normalized). Ignored: test fixtures (byte-exact inputs) and the generated `icon-data.ts` and `tokens.ts` (oxfmt rewrote escaped quotes in `icon-data.ts` into invalid code; the generators own their output). Line endings: `.gitattributes` sets `* text=auto eol=lf` and the tree was converted once (185 files were CRLF). |
| `@resvg/resvg-js` 2.6.2, devDependency of `apps/extension` and `apps/desktop` | Rasterises the Voice hub logo SVGs (`packages/ui/assets/logo`, from `packages/ui/scripts/gen-logo.mjs`) into the extension icons, the desktop app and tray icons and the installer .ico. Prebuilt native binary, no browser needed. Rejected: playwright (screenshots a page, slow start), sharp (libvips for one job), the old hand-drawn pixel code. |
| `figma-squircle` 1.1.0 (MIT), dependency of `designs/logo/v2` only (not shipped) | Continuous-corner squircle path for the logo container (`designs/logo/v2/squircle.mjs`), Figma's and Apple's corner smoothing. Rejected: a superellipse (n = 5 bulges at the edges and its corners are too round), hand-built Bezier corners. |

## Type packages, language and toolchain (named 2026-11-01 for the dependency check)
These direct dependencies were in `package.json` files without a row here (refactor plan G19). Versions are the lockfile's; `check-deps.mjs` (work package 1) fails when a direct dependency is missing from this file or an ADR.

| Package | Why |
|---|---|
| typescript | the language service types and the `tsc` fallback and nightly drift check (ADR 0012); tsrs is the blocking gate |
| vite-plus | the toolchain (`vp`: dev, build, test, lint, format); see "Built in" above |
| @types/node | Node 24 types for the server, engine and desktop main |
| @types/react, @types/react-dom | React types for the popup, options, side panel and desktop renderer |
| @types/chrome | `chrome.*` types for the extension (`latest` today; WP-1 pins it) |
| @types/pngjs | types for `pngjs` used in the visual and screenshot tests |
| radix-ui | accessible primitives underneath `@speakkit/ui` (Lumen components): dialog, popover, select, tooltip and similar; keyboard and focus behaviour is not re-implemented |

## Repository hygiene (public-kit)
| Choice | Why |
|---|---|
| `pnpm licenses list --prod --json` (built into pnpm) | Source of `THIRD_PARTY_NOTICES.md`, rendered by `tools/third-party-notices.mjs` (`--check` fails when the file is stale). Considered `license-checker-rseidelsohn`, `license-report` and `generate-license-file`: each adds a dependency to report what pnpm already reads from its own store, with the SPDX grouping and pnpm layout handled correctly. No new package. |
| Contributor Covenant 2.1 text | `CODE_OF_CONDUCT.md`, copied from contributor-covenant.org; only the contact line is changed. |
| Dependabot (`.github/dependabot.yml`) | npm in `code/` (weekly, minor and patch grouped) and GitHub Actions. |

## Gates, ratchets and dependency policy (wp1-gates)

| Choice | Why |
|---|---|
| pnpm catalog in `code/pnpm-workspace.yaml`, `catalog:` in every `package.json` | One place for exact pins; `scripts/check-deps.mjs` fails on a range, on a dependency missing from the catalog and on a dependency no decision record names. |
| `minimumReleaseAge: 10080` (7 days, in minutes) | Supply-chain delay; versions younger than a week when the lockfile was first pinned (2026-11-01) are listed in `minimumReleaseAgeExclude` and each entry is deleted once its version is a week old. |
| `fast-check` 4.10.2, root devDependency | Property tests; the first one covers the ratchet comparison (`scripts/canary/checks.test.mjs`). ADR 0003. |
| `knip` 5.88.1 as a pinned dev dependency of `tools/knip`, with `typescript` 6.0.3 there | Replaces `pnpm dlx knip@5.88.1`. Knip 5 needs the TypeScript JS API, which TypeScript 7 does not ship, so it lives in its own workspace package with TypeScript 6; the other packages stay on 7. Run through `scripts/check-knip.mjs`. |
| `typescript` 7.0.2 (root), `vite-plus` 1.4.0, `@types/node`, `@types/react`, `@types/react-dom`, `@types/chrome`, `@types/pngjs`, `radix-ui` | Already in use; named here so that `check-deps.mjs` finds every direct dependency in a decision record. `radix-ui` is the primitive layer under the Lumen components in `@speakkit/ui`. |
| Lint limits and import boundaries in `code/vite.config.ts` | Oxlint rules only, no extra linter. Rules that still have violations are warnings counted by `scripts/check-ratchet.mjs` against `.ratchet/<package>.json`; WP-15 turns them into errors. |
| Own scripts `check-ratchet`, `check-css`, `check-network`, `check-integrity` | Small greps over the tree; each has a known-bad fixture in `scripts/canary/` that the unit test requires to fail. No stylelint (ADR 0003). |
