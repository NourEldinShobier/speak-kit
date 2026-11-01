# Testing SpeakKit

## Run it

From `code/`:

| Command | What it does |
|---|---|
| `pnpm exec vp test run` | Unit and integration tests of every package (vitest through Vite+). `e2e/` is excluded by `code/vite.config.ts`. |
| `pnpm exec tsrs --noEmit -p <dir>` | Type check (`packages/*`, `apps/extension`, `apps/desktop`, `e2e/tsconfig.check.json`). |
| `pnpm run e2e` | Builds the extension with test hooks into `apps/extension/dist-e2e` (`SPEAKKIT_TEST=1`, own folder so a normal `dist` build cannot overwrite it), runs the fast Playwright suite, then the performance budgets alone (1 worker). |
| `pnpm run e2e:full` | Same plus the `@slow` tests: real Kokoro model through the real server CLI, and the Electron desktop app. Also builds the desktop app. |
| `node e2e/run.mjs tests/popup.spec.ts -g "offline"` | Any Playwright args after the script; skips the perf phase. `--no-build` reuses `dist-e2e`. |
| `E2E_HEADED=1` | Show the browser. Default is Chromium's new headless mode (`channel: "chromium"`, supports extensions). |

Perf numbers from the last run are in `code/e2e/perf-results.jsonl` (one JSON object per line) and summarised in `docs/perf.md`.

## How the suite works

- Each test gets a fresh persistent Chromium profile with the unpacked test build, a fresh in-process `packages/server` (fake engine) on a random port, and a fixture web server (`http://localhost:<port>`, served from `e2e/support/pages.ts`). Only the `@slow` suite uses the real Kokoro engine, started as the standalone CLI with the shared model cache in `code/.cache/models`.
- Pairing always goes through the real options page (type port and token), never by writing storage.
- Sound is proven with the offscreen player's `window.__speakkit` hook (state, `framesReceived`, `scheduledMs`, analyser `rms()`, plus `rate`, `ctxState`, `ctxTime`). Playwright cannot see the offscreen document, so the suite reads it over raw CDP (`--remote-debugging-port=0`, `DevToolsActivePort`).
- Every test fails if any extension context logs a console error or throws (service worker, extension pages, content pages, offscreen document). Tests that provoke connection errors declare which messages are expected.
- The popup is opened as a normal tab (`popup.html?tab=<id>`); test builds honour `?tab=` because a popup opened as a tab would otherwise see itself as the active tab.
- Test-only hooks exist only when built with `SPEAKKIT_TEST=1` (`__TEST__`): open Shadow DOM in the content script, `window.__speakkit` in the offscreen page, `globalThis.__speakkit` in the service worker (`command(name, tabId)`, `menu(id, tabId, selectionText)`, `menus()`), and `?tab=` in popup and side panel.

## What is covered

Files in `code/e2e/tests`:

- `pairing.spec.ts`: pairing success, token stored in local (not sync) storage, token rejected and re-pair, app not running then recovery, engine downloading/loading/ready text, port validation.
- `popup.spec.ts`: popup states install, token, offline (and recovery), loading-model with progress, restricted `chrome://` page, restricted page via keyboard path, selection state reads only the selection, voice preview without changing the saved voice, voice list from the app.
- `playback.spec.ts`: idle, Listen, preparing, playing with RMS above threshold and scheduled audio advancing; extraction filters (nav, ads, footer, code, citations, long URLs); pause and resume; seek plus/minus 10 s; next/previous paragraph; speed change re-requests, 3x uses `playbackRate` 1.5; voice change; finished and replay; sentence and word highlight moving; auto-scroll; stop cancels server-side synthesis.
- `content.spec.ts`: selection bubble (Listen reads only the selection, collapses, setting applies live, speed popover); paragraph gutter (reads from there, setting); edge launcher (peek tab, hover opens, Listen, reading layout, drag and saved y, close delay, open on click, left side live, `hidden` idle mode, disabled); dock (voice and speed popovers, pause, skip, always-dock rule); in-page keys; back-to-current pill with and without auto-scroll.
- `system.spec.ts`: keyboard commands, context menu entries and clicks, queue and side panel (add, play now, remove, clear, outline, toast), auto-advance and auto-play off, site rules never-read, hide-controls and live rule changes, live highlight settings, dark page palette, two tabs, tab close and navigation stop playback, server restart mid-playback with retry, token changed under a running app, engine not ready.
- `options.spec.ts`: every section opens, a toggle persists across reload, launcher side.
- `lifecycle.spec.ts` (11, fast): `POST /v1/engine/warm` once per window (popup open, launcher tab hover, Listen-button hover; a hover after the 5 s debounce warms again; a popup open loads an unloaded model before any click); an unloaded engine reads "Wakes on play" in options and popup, never as an error, and a play wakes it (dock shows "Waking the voice engine", popup "Waking up"); idle unload with a short window, health reports `idleUnloadAtMs`, the next play reloads transparently; pause sends hold 600000 and the model survives three idle windows, resume sends hold 0 and it unloads afterwards; the offscreen document closes after stop (idle close shortened with `ext.fastIdleClose()`) and a later play creates it again; closing the tab aborts server-side synthesis; stream cap (queue, 429 busy with Retry-After) and `X-SpeakKit-Replace` at HTTP level; seeks and speed changes from the extension send the header and never hit the cap.
- `ui.spec.ts` (8, fast): the Lumen read-aloud pill (dock): paragraph text, progress bar, next/previous, click-to-seek, pause/resume, speed and voice popovers, close, "Done · Read again" and replay, voice list equals `/v1/voices`; Reader view (open from the launcher pill and from the popup, reading settings Font/Size/Theme/Highlight change the view and persist across a reload, sentence and word highlight inside the reader, paragraph click seeks, closing keeps the audio); speeds above 2x (playbackRate 1.5 over the model's 2x, pitch measured with a DFT of the analyser output against the tone the fake engine made for the sentence, scheduling gap measured by the player); deep link (Open SpeakKit opens `speakkit://launch`, protocol handler faked by recording `chrome.tabs.create`, popup recovers when the app starts); decoded audio held by the player stays under 8 MB across 250 paragraph jumps and is 0 after stop.
- `perf.spec.ts`: budgets listed in `docs/perf.md`.
- `full.spec.ts` (`@slow`, 3): real Kokoro first audio and sound, voice and 3x speed, and the lifecycle test: first audio after a popup warm (about 0.5 s) vs from an unloaded model (about 1.6 s), server process-tree working set unloaded (about 79 MB) / ready (about 657 MB) / after idle unload (about 78 MB).
- `desktop.spec.ts` (`@slow`, 4): start the Electron app, read the token shown in its UI, pair the extension with it, read a page to the end, regenerate the token and watch the extension fall back to "not paired"; the setup wizard's Connect step (Test connection turns Connected when the real extension pairs, then a page is read); Settings > Memory 'Idle unload' changes `idleUnloadAtMs` in the server's health; a second launch with `speakkit://launch` brings the hidden first instance forward.
- `apps/desktop/tests/smoke.test.ts`, `shell.test.ts`, `perf.test.ts` (run by `vp test run`, drive Electron through Playwright `_electron`): first-run wizard, token reveal/copy, regenerate, voices, tray/single instance, Lumen shell measurements, command palette, every settings page, Memory settings persisted, tray menu and icon follow the engine state, Quit confirmation, `speakkit://pair`, hidden window stops polling, memory budget.

## Last result

`pnpm run e2e:full` (2026-11-01): 89 passed in the main phase (82 fast + 7 @slow: real Kokoro x3, desktop x4) and 5 passed in the perf phase, 0 failed, 0 skipped, 0 flaky. Fast set (`pnpm run e2e`): 82 + 5 = 87 tests, about 3 minutes with 3 workers. `vp test run`: 286 passed (31 files: 27 run, 4 opt-in real-model files skipped), 20 skipped tests (opt-in real-model suites), 0 failed. Type checks clean with tsrs on protocol, engine, server, ui, extension, desktop and e2e.

Bugs the new tests found and that were fixed: the extension opened `speakkit://open` while the desktop app only accepts `speakkit://launch` and `speakkit://pair` (the app was never started from the extension); with the Reader view open, starting a read from the popup, pill or a shortcut built a new document, so nothing was highlighted in the reader (the reader's own document is now reused); stale selectors and a stale dock height in the old suites after the restructure.

## Known gaps (exact)

- Native UI is not driven: the browser's context menu and global keyboard shortcuts cannot be clicked in Playwright. Tests call the service worker's own `onClicked` and `onCommand` handlers through the test hook, and read the registered menu titles and `chrome.commands.getAll()` shortcuts back. Whether Chrome delivers the real key press is untested. Ctrl+Shift+P and Alt+Shift+P are not assigned by Chrome in this setup, so play/pause moved to Ctrl+Shift+Y.
- Real audio output was not heard. Sound is proven from the analyser (RMS) and the AudioContext clock only; no one has listened to voice quality (uint8 vs q8 included).
- The real toolbar popup and the real side panel are not opened: both run as extension tabs. The `activeTab` grant that a toolbar click gives is therefore not exercised, so the popup's `file://` ("allow file access") state is not covered; for a `file://` or `chrome://` tab the tab URL is hidden from the extension and the popup shows the generic "page unreadable" state.
- On-demand content script injection (a tab opened before the extension was installed) is not tested.
- `chrome://` is covered; the Web Store and the PDF viewer are only covered by the pure URL tests in `background.test.ts`.
- Only one browser engine and one OS: headless Chromium (bundled, build 1248) on Windows 11. Branded Chrome ignores `--load-extension`.
- The 10-minute read is simulated, not played: 600 paragraph jumps in about 20 s with the fake engine, measuring the offscreen document's JS heap after a forced GC. Decoded audio held by the player is now measured (`retainedBytes` hook, 250 jumps, under 8 MB, 0 after stop), but the renderer process's real memory (AudioContext internals, worklet) is not.
- Pitch preservation above 2x is checked on the fake engine's pure tones with a DFT of the analyser output, not on speech; gaplessness is the player's own scheduling lateness (`maxLateMs`), not a recording of the speaker output.
- Real-engine timings (first audio about 1.5 s warm path through the shortcut, 0.5 s after a popup warm, 1.6 s cold) were taken on a shared machine at 25 to 50% CPU and move by 30%. The warm shortcut assertion is best of three and allows the larger of 1.5 s and server-only + 0.9 s. Idle windows of 5 and 15 minutes were not waited for: tests use windows of 1.2 to 4 s and read `idleUnloadAtMs` for the longer ones.
- The deep link is faked in the browser (no OS protocol handler is registered in the test profile). The desktop side is real: a second launch with `speakkit://launch` or `speakkit://pair` focuses the first instance. Registering the protocol with Windows (`setAsDefaultProtocolClient`) is skipped under `SPEAKKIT_USER_DATA`.
- The desktop e2e uses the fake engine; only `full.spec.ts` uses real Kokoro, through the standalone server CLI, not through the Electron app (child-process model host under Electron is not tested). Tray icon pixels, toasts and launch at login are not driven; tray state mapping and the Quit dialog are covered in `apps/desktop/tests/shell.test.ts`.
- "Launch at login" in the desktop app and installers are not tested.
- `vp lint` was not run: it walks `node_modules` in this checkout and prints thousands of third-party warnings. `vp fmt` was not run on the new files.
- Visual fidelity against `designs/next/screens` belongs to the visual harness (`code/e2e/visual`, see visual-fidelity.md): it captures every state in dark and light from the built product, diffs it against the designs and builds `designs/built/review.html`.
