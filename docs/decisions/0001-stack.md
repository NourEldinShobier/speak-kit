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
