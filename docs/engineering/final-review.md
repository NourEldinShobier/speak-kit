# Final review of the refactor

Independent pass over everything refactored since the repository was recreated (WP-1 to WP-14 work, about commit 40 onward). Method: ostio-practices section 14 checklist and section 15 anti-slop list, plus targeted scans of all runtime code for sync file calls, silent catches, listeners and timers without cleanup, off-machine hosts, error text crossing processes, weak assertions, and assertions removed by refactor commits (none were: no `refactor(` commit removes more than two `expect` lines net).

Severity: bug (wrong behaviour or data loss), risk (can fail under conditions), smell (cost without failure). Status: fixed (commit named), open (owner and reason).

## Findings

| # | Where | Rule | Severity | Finding and fix | Status |
|---|-------|------|----------|-----------------|--------|
| 1 | `packages/engine/src/chatterbox/voice-store.ts` constructor | R1 to R9, ostio F (user data) | bug | A corrupt `index.json` was swallowed and the store started empty; the next `create` overwrote the file, so every cloned voice's name and checks were lost (the clips stayed orphaned). Fix: set the file aside as `index.json.bad`, like `engines.ts` does for `engine.json`; test first in `tests/clone.test.ts`. | fixed: `fix(engine): a corrupt cloned-voice index ...` |
| 2 | `apps/desktop/src/renderer/features/voices/VoicesPage.tsx:54` | CLAUDE 12, error model | bug | The failed voice load showed `String(e.message ?? e)`, i.e. the raw `Error invoking remote method ... speakkit-error:{json}` text. Every other page uses `cleanError`. Fix: `cleanError(e)`. | fixed: `fix(desktop): the voices page words a failed load ...` |
| 3 | 16 sites with `.catch(() => {})` and no reason (tray wake, server lifecycle, player suspend/resume/close, engine start in routes, content copy, launch close tab, and others) | CLAUDE 12, C15 | smell | Rule 12 asks for a typed handler or a one-line reason. Fix: a reason on each. | fixed: `refactor: every ignored promise rejection carries a one-line reason` |
| 4 | `packages/engine/tests/chatterbox.test.ts` (6 sites), `fake.test.ts` (2) | T1 to T4 | smell | `resolves.toBeDefined()` passes for empty audio, and `rejects.toBeDefined()` for any rejection. Fix: assert `pcm.length > 0` and `rejects.toThrow()`. | fixed: `test(engine): recovery tests assert the audio ...` |
| 5 | `apps/extension/src/app/background/state.ts` (badge text), `packages/ui/src/react/display.tsx:19` | CLAUDE 11 | smell | Nested ternaries; `idle = idleState` alias exported next to the function. Fix: table lookup, one exported name; ratchet baselines lowered (extension 2 to 0, ui 1 to 0). | fixed |
| 6 | `apps/extension/src/app/background/index.ts:27` | CLAUDE 12 | smell | A route that throws answers `{ ok: false, error: String(e) }`: exception text crosses to the content script. No consumer reads it (checked `content/controller.ts`, `docs.ts`), so it is diagnostic only. Fix: answer a fixed code and log the exception in the worker. | open: extension owner; no behaviour depends on it, needs a decision on whether the worker logs |
| 7 | `packages/server/src/http.ts` `withDeadline` | A, F | risk | On 504 the abandoned handler keeps running (documented in the TSDoc). For `POST /v1/export` the job still gets created after the client saw 504. Fix: pass an `AbortSignal` into `route.handle` and abort on deadline. | open: server owner; changes the route handler signature, so a design decision |
| 8 | `packages/server/src/server.ts` `createServer` | R | risk | No `error` listener on the node server after `listen` resolved; a later server error is an uncaught exception in the desktop main process. Fix: log and ignore, or surface through the desktop lifecycle. | open: server owner with desktop main |
| 9 | `packages/ui/src/vanilla/controls.ts:138-140` | L10, CLAUDE 6 | smell | Slider range uses `style.left` and `style.right` (physical). The other physical offsets in `bubble.ts`, `placement.ts`, `edge.ts`, `gutter.ts` come from `getBoundingClientRect` viewport geometry and are correct. Fix: `insetInlineStart` and `insetInlineEnd`, with a screenshot check. | open: ui owner; needs the visual harness |
| 10 | Remaining lint warnings in runtime code | CLAUDE 11 | smell | `max-params` in `player/src/player.ts` (2), `player/src/stream.ts`, `ui/src/vanilla/dom.ts`, `desktop/src/shared/export.ts`, `desktop/src/main/updates-service.ts`; `complexity` in `player/src/chunk.ts` (`readChunk`), `extension/src/app/background/player.ts`, `desktop/src/renderer/UpdateCard.tsx`; `max-lines-per-function` in `UpdateCard.tsx`, `updates-service.ts`, `ui/src/vanilla/controls.ts`; `extension/src/features/launcher/edge.ts` is 341 lines. All are held by the ratchet and none grew. | open: the owning package; each is a pure restructuring |
| 11 | `e2e/**`, `apps/desktop/tests/*.ts`, `packages/server/bench/leak.ts` | CLAUDE 11 | smell | 25 `no-explicit-any` warnings in test code. | open: e2e owner |
| 12 | `e2e/support/ui-checks.ts:31` | CLAUDE 11 | smell | Complexity 36 in one function. | open: e2e owner |

## Checked and clean

- Synchronous file calls: only at startup, each with a reason (`engines.ts`, `export.ts`, `server.ts` `loadToken`, `voice-store.ts`, `chatterbox/engine.ts`, `kokoro.ts` model check); none in `apps/*`.
- Listeners and timers: every `setInterval` has a `clearInterval`; the only document-level listener (`edge.ts` `pointermove`) is removed by `awayOff`; the background listeners live for the worker.
- Off-machine hosts: `api.github.com` (update check), `download.pytorch.org` and Hugging Face (Chatterbox install, on request), `speakkit.app` (links the user clicks). All are on `docs/privacy.md`; `check-network` passes.
- IPC: every channel is registered through `registerValidatedIpc` (sender check plus a valibot argument schema); errors cross as `DesktopFault` code and arguments; the update error is classified in main before it is sent.
- Child processes get `childEnv()`, an allowlist.
- Tests: `vi.mock` is used for `electron`, window classes and sibling modules of the unit, never for the unit itself; no `.skip`, `.only` or retries (one `ctx.skip()` in `ui/tests/generated.test.ts` when the generator output is absent).

## Gates (run once, whole suite)

| Check | Result |
|-------|--------|
| `pnpm typecheck` | pass, all projects |
| `pnpm lint` | pass; warnings are the ratcheted ones in findings 10 to 12 |
| `pnpm fmt:check` | pass |
| `pnpm run gates` (deps, css, network, integrity, ratchet) | pass; two ratchet baselines lowered by this review (extension and ui nested ternary, engine no-sync) |
| `pnpm knip` | pass |
| `pnpm test` | first run under load: 11 files failed. Cause: the Electron binary was not installed, so many desktop tests raced to download it and the PDF, icon and server-lifecycle tests timed out on a busy machine. After `electron/install.js`, `vp build` of the desktop app, and one file group at a time, all passed: desktop `src/main` (config, icon-data, library), `tests/reader`, `shell`, `system`, `smoke` (6), `packages/server/tests/lifecycle`, extension `budget` and background, ui, engine. `apps/desktop/tests/perf.test.ts` was not rerun (perf-timing, outside the allowed set). |
| e2e: popup, content, playback, lifecycle, system | 8, 20, 12, 12, 18 passed, one spec file at a time |
| Packaged desktop (`package.mjs --platform win --dir`, `smoke-packaged.mjs`) | SMOKE PASSED: fuses, health, 28 voices, speak, 2 processes, second launch hands over, `--quit` exits, port freed, 0 processes left |
| Bundle budgets | `apps/extension/src/budget.test.ts` and `apps/desktop/tests/bundle.test.ts` pass (extension sizes script budgets and per-entry gzip budgets of the renderer) |

## Remaining

Open findings 6 to 12 above. Findings 6 to 8 need an owner decision (answer shape of a failed route, abort on deadline, server `error` listener); 9 to 12 are plain restructuring held by the ratchet.
