# Speak Kit refactor plan: gap analysis against the Ostio practices

Written 2026-11-01. Inputs: `docs/engineering/ostio-practices.md` (rule IDs such as `C3` refer to it) and a read-only survey of `code/` the same day. Nothing in `code/` was changed. Another session edits the code at the same time, so line numbers below drift by a few lines; re-grep before editing.

## 0. Summary

- **66 gaps** (G01 to G66). 9 change behaviour (G04, G08, G27, G29, G30, G51, G52, G56, G59), 1 changes the internal desktop IPC contract (G42), 6 wait on a decision from the user (G30, G44, G53, G57, G58, G59; section 5). The other 51 keep behaviour unchanged.
- **16 work packages** in three waves (section 4), about **135 agent-hours** plus 28 for the optional localization package. Wave 1 has 11 packages that touch disjoint files and can run in parallel.
- No work package changes the wire protocol (`packages/protocol`, the `/v1/*` routes). The nine behaviour changes are marked B in the "Flag" column; none ships without the user's yes.
- Speak Kit already follows the Ostio ideas that cost the most to retrofit: one-way package graph with no import cycles, a loopback server with token, Origin and Host checks, validated IPC, a sandboxed secure-window factory, schema-validated settings and bodies, fake engine and injected clocks in tests, a bundle budget test, axe and keyboard e2e specs, a packaged-app smoke test, Conventional Commits enforced by a hook, and a "what was not run" list in `docs/testing.md`.
- What is missing is mostly enforcement and structure: no lint limits and no ratchets (62 over-long functions, 36 over-complex functions, 92 nested ternaries and 11 files over 300 lines in non-test code), no reducers or error boundaries in any React root, no process inventory, no performance contract table, no ADR process, no glossary, no generated module docs, no deadlines on server calls, document parsing on the Electron main thread, and stricter TypeScript flags that fail on about 200 sites.

### Findings that matter most, in order

1. Electron main carries the HTTP server, IPC, library import parsing (pdf.js, mammoth, Readability, epub) and 30 synchronous file calls, with no event-loop delay measurement (G01, G02, G03).
2. No lint limits or ratchets exist; the Ostio limits would flag 38 functions over complexity 15, 136 over 50 lines, 96 nested ternaries, 55 over three parameters and 16 files over 300 lines, including tests (G36).
3. UI state is `useState` clusters (13 in `App.tsx`, 12 in `Reader.tsx`, 12 in `ExportDialog.tsx`); flows are `if` and ternary chains (`Popup.tsx` has one component of 260 lines and complexity 55); no React error boundary exists (G22, G23).
4. The desktop renderer has a library-and-reader feature cycle and eleven top-level UI modules outside `features/` (G16, G17).
5. `exactOptionalPropertyTypes` fails on 156 sites and `erasableSyntaxOnly` on 48 (G20).
6. Electron hardening is partial: no permission handlers, no fuses, renderer loaded from `file://`; `RunAsNode` must stay on while the model host uses `child_process.fork` (G51, G52).
7. Child processes inherit the full environment (`...process.env`) in two places and run executables found by bare name (G55, G56).
8. Errors cross IPC as English text from `e.message` in five desktop paths (G42), and 31 catch sites swallow errors without a recorded reason (G41).
9. Dependencies: 24 of 40 direct dependencies use `^` or `~` ranges, there is no `minimumReleaseAge`, `knip` runs through an unlocked `pnpm dlx` (G18).
10. Docs: `0001-stack.md` is the only decision record and has no template, status or numbering; there is no glossary, privacy page, threat model or performance contract (G26, G31, G40, G50, G63).

## 1. Baseline (the numbers the ratchets start from)

Measured on 2026-11-01 with the Ostio limits, in a scratch folder outside both repos. Test files, `e2e/`, `*/tests/`, `*/testing/`, benches and `packages/ui/gallery` are excluded from the non-test figures.

Rule set used (oxlint through `pnpm exec vp lint -c <file> --import-plugin --react-plugin --node-plugin -f unix apps packages e2e`):

```json
{ "plugins": ["typescript","unicorn","oxc","react","import","node"], "categories": { "correctness": "off" },
  "rules": { "complexity": ["error",{"max":15}], "max-depth": ["error",{"max":4}], "max-params": ["error",{"max":3}],
    "max-lines-per-function": ["error",{"max":50,"skipBlankLines":true,"skipComments":true}],
    "max-lines": ["error",{"max":300,"skipBlankLines":true,"skipComments":true}],
    "no-nested-ternary":"error","no-else-return":"error","no-lonely-if":"error",
    "react/rules-of-hooks":"error","react/exhaustive-deps":"error","import/no-cycle":"error",
    "typescript/no-explicit-any":"error","typescript/ban-ts-comment":"error","node/no-sync":"error","no-console":"error" } }
```

Violations in non-test code, by package and rule (these become the first ratchet baselines; `no-sync` and `no-console` include build scripts and CLIs that the real rule will exempt):

| Package | files >300 | fn >50 lines | complexity >15 | nested ternary | params >3 | exhaustive-deps | max-depth | no-sync | no-console |
|---|---|---|---|---|---|---|---|---|---|
| apps/desktop | 4 | 34 | 13 | 36 | 14 | 5 | 0 | 54 | 10 |
| apps/extension | 4 | 23 | 18 | 43 | 10 | 1 | 1 | 15 | 4 |
| packages/ui | 1 | 1 | 0 | 7 | 0 | 0 | 0 | 17 | 5 |
| packages/player | 1 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 0 |
| packages/server | 0 | 2 | 2 | 1 | 2 | 0 | 0 | 16 | 4 |
| packages/engine | 0 | 1 | 1 | 5 | 5 | 0 | 0 | 14 | 0 |
| packages/protocol | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

In tests and e2e: 161 `no-sync`, 75 long functions, 22 `no-explicit-any`, 21 `max-params`, 12 `no-console`, 6 files over 300 lines, 2 `rules-of-hooks`. Tests keep their own looser baseline (functions in a `describe` are long by nature); do not chase them in this refactor.

Worst non-test offenders (use these as the first split targets):

- Files over 300 effective lines: `app/content/controller.ts` 773, `app/popup/Popup.tsx` 483, `renderer/features/reader/Reader.tsx` 438, `packages/player/src/player.ts` 400, `renderer/App.tsx` 399, `renderer/settings.tsx` 384, `packages/ui/src/vanilla.ts` 378, `renderer/Wizard.tsx` 369, `features/launcher/edge.ts` 353, `features/player/dock.ts` 326 (`packages/ui/gallery/board.tsx` 634 is the dev gallery and is excluded).
- Complexity: `Popup.tsx:221` 55, `features/reader/collect.ts:102` 44, `connection/popup-view.ts:75` 43, `connection/ConnectionCard.tsx:19` 43, `Reader.tsx:38` 38, `background/router.ts:26` 34, `content/controller.ts:602` 33, `PopupApp.tsx:16` 32, `Wizard.tsx:48` 32, `LibraryPage.tsx:21` 30, `shared/engines.ts:22` 26, `QueuePanel.tsx:23` 25.
- Function length: `Reader.tsx:38` 378, `LibraryPage.tsx:21` 275, `Popup.tsx:221` 260, `App.tsx:54` 217, `ConnectionCard.tsx:19` 199, `Wizard.tsx:48` 177, `main/desktop.ts:49` 174, `ExportDialog.tsx:19` 173, `SitesSection.tsx:31` 140, `PopupApp.tsx:16` 120, `EnginesPage.tsx:14` 118, `QueuePanel.tsx:23` 108, `launcher/edge.ts:161` 108.
- Nested ternaries: `Popup.tsx` 9, `player/dock.ts` 8, `ConnectionCard.tsx` 7, `ui/vanilla.ts` 6, `launcher/edge.ts` 6, `Wizard.tsx` 5, `engine/text/normalize.ts` 4, `player/Transport.tsx` 4, `ExportDialog.tsx` 4.

Other measurements:

| What | Number | How to reproduce |
|---|---|---|
| Import cycles between files | 0 | `import/no-cycle` on `apps packages e2e` (the rule was checked against a two-file cycle probe) |
| Feature-level cycle | 1 (desktop renderer `library` and `reader`) | imports in `renderer/features/*` |
| `exactOptionalPropertyTypes` errors | 156: desktop 47, extension 33, server 27, player 20, engine 14, ui 11, protocol 4 | `tsrs --noEmit -p <project>` with the flag added in a scratch tsconfig that extends the project one |
| `erasableSyntaxOnly` errors | 48: extension 21, desktop 19, player 8 (all parameter properties or enums) | same, flag `erasableSyntaxOnly` |
| `noUnusedLocals` / `noUnusedParameters` | 2 (extension) | same |
| `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | 0 | same |
| `as any` / `as unknown as` outside tests | 10 / 31 (89 together with tests) | grep |
| Catch sites that swallow (empty `catch`, `.catch(() => {})`) outside tests | 31 | grep `catch *\{ *\}` and `.catch(() => {})` |
| `*Sync` file calls in runtime code of server, engine, player, desktop main | about 30 | grep `readFileSync|writeFileSync|existsSync|...` excluding scripts and tests |
| Direct dependencies / with `^` or `~` / not named in `0001-stack.md` | 40 / 24 / 8 | `node` script comparing `package.json` files with the ADR text |
| JSX text literals outside tests (`react/jsx-no-literals`) | 351 | oxlint |
| Manual plural branches (`n === 1 ? "x" : "xs"`) | 10 or more sites | grep |
| Physical CSS properties in source CSS | 52 lines in 6 files (`launcher.css` 14, `compose.css` 11, `lumen.css` 9, `reader.css` 8, desktop `shell.css` 6, content `shell.css` 4) | grep `margin-left|padding-right|left:|right:|text-align: left` |
| Test files / tests passing | 121 files / 790 of 796 in the last baseline run (2 flaky failures in `replace.test.ts` and `system.test.ts`, both timing) | `pnpm exec vp test run` |
| CI jobs | 1 (Windows, everything, perf phase skipped via `E2E_SKIP_PERF=1`) | `.github/workflows/ci.yml` |

## 2. Gap analysis by rule family

Column "Flag" marks a gap whose fix changes behaviour (B), changes the internal IPC contract (I) or needs a user decision first (D). "WP" numbers are in section 4. Rules not listed in a family are either followed (listed under the table) or not applicable (see `ostio-practices.md`).

### 2.1 Architecture and process model

| ID | Rules | Where (evidence) | Change | WP | Flag |
|---|---|---|---|---|---|
| G01 | A2, F9 | Library import parsing runs on the Electron main thread: `apps/desktop/src/main/library/service.ts:53` calls `parseFile` (`parse/{html,pdf,pdf-layout,docx,epub,markdown}.ts`: linkedom, Readability, pdf.js, mammoth, epub-parser). MP3 encoding is already in a worker (`main/export/mp3-runner.ts`); synthesis is in a child process. | Run `parseFile` in a `worker_threads` worker (`library/parse/worker.ts` plus `parse-runner.ts`, same shape as `mp3-runner.ts`); pass the bytes as a transferable `Uint8Array`; parse modules stay unchanged. | 11 | — |
| G02 | A12, F4 (N2), F11 | The loopback server, IPC, state publication and import all run on Electron main. Nothing measures event-loop delay (`monitorEventLoopDelay` appears nowhere). | Add a test that samples `perf_hooks.monitorEventLoopDelay` in the packaged-like Electron run while a fake-engine stream, an export and an import run; budget p99 at most 10 ms, recorded in the performance contract (G31). | 11 | — |
| G03 | F8, A12 | About 30 synchronous file calls in runtime code that executes inside Electron main: `packages/server/src/export.ts` (`rmSync` lines 46, 91, 99; `statSync` 70; `mkdirSync` 52), `server/src/engines.ts` (read 30, write and rename 89 to 91), `engine/src/chatterbox/voice-store.ts` (`writeFileSync` of a clone clip up to 40 MB at line 51, `rmSync` 62, index write 77), `desktop/src/main/handlers.ts:102,124`, `server-lifecycle.ts:176`. | Switch request-path calls to `fs/promises`; keep startup reads (token, package.json) sync with `oxlint-disable-next-line node/no-sync -- startup`. | 4, 5, 11 | — |
| G04 | A13, F23 | `packages/engine`: the model host and the Chatterbox sidecar restart on the next request after a crash with no crash-loop limit; the installer (`chatterbox/engine.ts:73`) and sidecar `synth` requests have no deadline; cancel kills the child but not its process tree (pip, uv children). | Count crashes in a 5 minute window; at three, set the engine to a failed state and stop auto-restarting until the user retries. Add a progress-heartbeat deadline for installer and sidecar (see G29). On Windows kill the tree with `taskkill /pid <pid> /T /F` via `execFile` (no shell). | 5 | B |
| G05 | A11, F13 | No process table or inventory. Real list: Electron main, main/mini/panel renderer windows, GPU and network services (in-process by flag), Kokoro host child (or worker), Chatterbox sidecar plus installer children, MP3 worker, extension service worker, offscreen document, content scripts. | Add the process table to `docs/architecture.md` (process, count, runtime, owns, start and stop rule, memory budget). Add a process-count assertion to `apps/desktop/scripts/smoke-packaged.mjs` and a grep check that lists `new Worker`, `fork(`, `spawn(`, `new BrowserWindow`, `new Tray` sites against the table. | 2, 11 | — |
| G06 | A14, A17 | No named startup phases or shared `performance.mark` calls; cold start was measured by hand (`docs/perf.md`, "Cold start"). | Marks `main:ready`, `server:listening`, `window:shown`, `renderer:first-paint`; the perf test reads them and asserts order and a budget frozen from the first run. | 11 | — |
| G07 | A19, S17 | Logging is `electron-log` plain text, one 1 MB file plus one old file (`main/log.ts`); no JSON lines, no request ids, no path hashing; the extension and server log through `console`. | Optional, last: JSON lines with `processId`, `requestId`; hash paths at `info`. Keep file location and rotation count unless the user asks. | 11 | — |
| G08 | A20, R6, R14, R15 | A corrupt `config.json` throws at startup (`main/config.ts:12`, electron-store with `clearInvalidConfig: false`); a corrupt `library/library.json` makes `LibraryStore.open` reject (`library/store.ts`, lowdb `db.read()`); `engine.json` is parsed with `JSON.parse` before `safeParse` (`server/src/engines.ts:30`). Not reproduced yet. | Write a failing test for each (invalid JSON file in a temp data dir). Then: rename to `<name>.bad`, start with defaults, show one notice. Never delete user data silently. | 11, 4 | B |
| G09 | A21, S14 | No privacy page. Network calls that exist: update feed (electron-updater, GitHub Releases), model download (kokoro-js, Hugging Face), Chatterbox install (pip or uv index, Hugging Face), URL import (user-supplied host, public addresses only). | Write `docs/privacy.md` listing each call, when it fires and what it sends. Add a check that fails when a new `fetch(` or `http(s).request` host appears in runtime code outside an allow-list file. | 2, 1 | — |
| G10 | A15 | `main/secure-window.ts` sets sandbox, contextIsolation, no node integration; `spellcheck` and an explicit `webSecurity: true` are not set; `FloatWindow("mini")` sets `backgroundThrottling: false` on purpose. | Set `spellcheck: false` and `webSecurity: true` in the factory; keep the mini-window exception with a comment. | 11 | — |

Followed: A1 (Listen and popup show designed loading states; `perf.spec` bounds Listen to first audio at 600 ms with the fake engine), A4 (lazy model, offscreen document, content script), A5 (audio frames are binary; library bodies load per document), A6 (four `process.platform` sites, all Windows-only features), A9 (library and reader work with the engine down), A10 (screenshots named after frame ids), A22 (idle-unload window setting).

### 2.2 Package graph and boundaries

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G11 | P4, T18 | Generated files with no regenerate-and-diff test: `packages/ui/src/icon-data.ts` (`scripts/gen-icons.mjs`), `logo-data.ts` (`gen-logo.mjs`), `apps/desktop/src/main/icon-data.ts` (`scripts/make-icons.mjs`). `tokens.ts` has `tests/tokens.test.ts`. | One test per file: run the generator into memory and compare with the committed file. | 7, 11 | — |
| G12 | P6, E7 | `code/vite.config.ts` has two import rules (renderer may not import `main/`; extension `app/` may not deep-import a feature). Missing: `electron` value imports only under desktop `main/` and `preload/`; no `node:*`, `fs`, `path`, `child_process` in renderer, extension, `packages/{ui,player,protocol}`; `ipcRenderer` only in `preload/`; global `chrome` only in extension `app/`, `shared/` and one port file. `chrome.*` is used directly in `features/settings/{ShortcutsSection.tsx:18,SitesSection.tsx:51,useCommands.ts}`. `apps/desktop/src/shared/library/preload-api.ts` imports a type from `electron`. | Add the rules with the type-import exception; move the three `chrome.*` uses behind `features/settings/browser.ts`. | 1, 9 | — |
| G13 | P7, C8 | `export *` in `packages/protocol/src/index.ts` (8 lines), `packages/ui/src/index.ts` (5 or more), `packages/engine/src/index.ts`, `packages/player/src/index.ts`, `apps/desktop/src/shared/library/contract.ts:4`, `apps/extension/src/features/{highlight,reader,voices}/index.ts`. No interface file has a header or TSDoc (checked all 15 `index.ts`). | Named exports; a 3 to 5 line header (what it does, what it does not do, area) and TSDoc on each exported function, type and error. | 3, 5, 6, 7, 8, 9, 12 | — |
| G14 | P8 | `packages/server/tests/helpers.ts`. | Rename to `harness.ts` and update imports. | 4 | — |
| G15 | P9, P12, C14, D14 | No deny-by-default layer rules and no generated `docs/MODULES.md` or `docs/LAYERS.md`. | Generator `code/scripts/gen-docs.mjs` (no new dependency: scans imports with a regex) writes both files; CI runs it with `--check`. LAYERS.md is generated from the same rule list that the lint config uses. | 1, 2 | — |
| G16 | P10, P11 | Desktop renderer: `features/reader/{OcrPanel,PlayerBar,Reader}.tsx` import `../library/api` and `../library/model` (deep), while `features/library/LibraryRoute.tsx` imports `../reader`. Extension: `features/reader/view.ts:4` imports `../settings/types` (`ReaderSettings` is already exported by `settings/index.ts`). The existing deep-import rule covers only `apps/extension/src/app/**`; `src/testing/entry.ts` also imports feature internals (test entry, allow-list). | Reader imports library only through `../library`; library no longer imports reader (compose the route in `App.tsx`). Fix `view.ts`. Then extend the rule to `apps/extension/src/features/**` and `apps/desktop/src/renderer/**` (wave 2). | 12, 8, 15 | — |
| G17 | P11, C6 | Desktop renderer root holds eleven UI modules outside `features/`: `App.tsx` 399 lines, `settings.tsx` 384, `Wizard.tsx` 369, `pages.tsx` 307, `ExportDialog.tsx` 250, `ui.tsx` 200, `EnginesPage.tsx` 135, `UpdateCard.tsx` 129, `settings-shortcuts.tsx` 126, `Palette.tsx` 97, `panel.tsx`, `mini.tsx`. | Make `wizard`, `settings`, `export`, `engines`, `updates`, `palette` features: `index.ts`, `model.ts` (reducer or table), view files under 300 lines. | 12 | — |
| G18 | P14, S11 | 24 of 40 direct dependencies use `^` or `~` (for example `vite-plus ^1.4.0`, `@types/node ^26.6.6`); `pnpm-workspace.yaml` has no catalog and no `minimumReleaseAge`; CI runs `knip` through `pnpm dlx knip@5.88.1`. | One catalog in `pnpm-workspace.yaml`, exact pins, `minimumReleaseAge: 10080` (minutes, 7 days), `knip` as a pinned dev dependency. Done in one commit by WP-1 so no other package edits `package.json`. | 1 | — |
| G19 | P15, P16 | 8 direct dependencies are not named in `docs/decisions/0001-stack.md`: `@types/chrome`, `@types/node`, `@types/pngjs`, `@types/react`, `@types/react-dom`, `radix-ui`, `typescript`, `vite-plus`. No check exists. | Name them in the ADR; add `code/scripts/check-deps.mjs` (every direct dependency appears in a decision record; every spec is exact). | 1, 2 | — |
| G20 | P19, C23 | `tsconfig.base.json` lacks `exactOptionalPropertyTypes` (156 errors), `erasableSyntaxOnly` (48), `noUnusedLocals`, `noUnusedParameters` (2), `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` (0 each). erasable sites are parameter properties in `player/src/{probe,output,timeline,scheduler,player,errors}.ts`, `desktop/main/library/store.ts`, `server-api.ts`, `public-fetch.ts`, `parse/index.ts`, `renderer/features/reader/model.ts`, and extension `features/{reader/view,player/dock,launcher/{notices,bubble,gutter,edge},highlight/highlight}.ts`. | Each package work package fixes its sites, proving it with a scratch tsconfig that extends the project one; WP-15 turns the flags on in `tsconfig.base.json` last. | all, 15 | — |
| G21 | P18 | `scripts/typecheck.mjs` runs only tsrs. | Keep tsrs as the gate (Speak Kit decision). Add a non-blocking `tsc --noEmit` per project in the nightly job to catch tsrs drift. | 1 | — |

Followed: P1 (`packages/protocol` imports no workspace package), P2 (no package imports `apps/*`), P3 (every package has two or more consumers), P7 for cycles (zero), P10 for the renderer and main split (neither imports the other), P14 for lockfile-only installs, `packageManager` pin and an install-script allowlist (`allowBuilds`), P17 (CLAUDE.md already says search npm and GitHub first).

### 2.3 UI architecture

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G22 | U1 to U5 | No `useReducer` or reducer anywhere. `useState` clusters: `App.tsx` 13, `Reader.tsx` 12, `ExportDialog.tsx` 12, `AddDialogs.tsx` 10, `ui.tsx` 9, `LibraryPage.tsx` 9, `ConnectionCard.tsx` 8, `pages.tsx` 8. Flows as `if` and ternary chains: setup wizard, export dialog, add-document dialogs, sleep timer, update card, popup states (`Popup.tsx`, `popup-view.ts`), queue panel. `switch` statements have no exhaustive `never` check. | For each: a discriminated-union state and action type, a pure `reduce(state, action)` in `model.ts` with `const unreachable: never = action`, table-driven tests with literal expected values; components dispatch and read selectors. The popup's states are the list in `docs/testing.md` (install, token, offline, loading, restricted, idle, selection, playing, paused, finished, version mismatch, engine missing). | 9, 12 (8 where launcher or dock states are tangled) | — |
| G23 | U7 | No React error boundary in any root: desktop `renderer/main.tsx`, `mini.tsx`, `panel.tsx`; extension popup, options, side panel; the reader view. | One `ErrorBoundary` component per UI package (in `packages/ui`, WP-7) used at each root: fallback with a "Reload" button; reports the error once through the existing log path. | 7, 9, 12 | — |
| G24 | U12 | The React hooks rules are not enforced. With them on: 5 `exhaustive-deps` violations in desktop and 1 in extension (non-test), 2 `rules-of-hooks` in tests. | Enable both as errors; fix the six sites. | 1, 9, 12 | — |
| G25 | U10, L21 | Four looping animations use literal durations: `packages/ui/src/lumen.css` lines 175 (spin 800 ms), 1138 (shimmer 1200 ms), 1180, 1197. Reduced-motion overrides are correct. | Add `--lm-dur-spin`, `--lm-dur-shimmer` tokens next to `--lm-ease*` and use them. | 7 | — |
| G26 | U16, D18 | No state matrix listing edge cases and sub-scenarios per feature (very long titles, 5,000 paragraphs, empty library, offline engine, narrow popup). | `docs/state-matrix.md`, one row per feature, each cell naming the design frame id or the test that covers it. | 2 | — |

Followed: U8 (hidden window destroyed after 30 s; polling stops while hidden, tested), U9 (reduced motion tested in `modes.spec.ts`), U14 (`@speakkit/ui` plus generated tokens), U15 and L14 and L16 (axe, keyboard and modes specs). U11 does not apply: the React Compiler is not used, so the roughly 40 `useMemo`/`useCallback` calls stay until a profile says otherwise.

### 2.4 Events and data flow

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G27 | E1, E3 | `ctx.publish()` is called from more than 20 sites (`main/desktop.ts`, `engines.ts`, `handlers.ts`, `export/service.ts`) and sends the full `AppState` to the window each time (`main/main-window.ts:57`, `windows.ts:54`). No coalescing; hidden windows still receive it. | Coalesce to one send per frame (`setImmediate` batch, at most one per 16 ms) and skip hidden windows (they resync on show). | 11 | B (timing) |
| G28 | E8, T17 | `packages/protocol/src/frames.test.ts` round-trips frames but there are no committed byte fixtures. | Add golden bytes for every frame type and one request body per route; the test decodes them. | 3 | — |
| G29 | E9, R12, V1 | Deadlines exist only for the health check (2 s) and URL import. No deadline on `/v1/speak`, warm, hold, engines, export routes, sidecar requests or installer steps. | Classes: control routes 8 s; `/v1/speak` stream aborts with the existing `synthesis-failed` error frame after 30 s without a frame; sidecar request 60 s without a progress line; installer 120 s without output. Generous defaults; no new wire fields or codes. | 4, 5, 10 | B |
| G30 | E11, V2 | `packages/server/src/stream-queue.ts`: speak streams and exports share the same synthesis slots, so a long export can delay reading. | Reserve one of the two slots for interactive streams, or let an interactive stream wait only on another interactive one. Needs the user's yes. | 4 | B, D |

Followed: E5 (producers never wait; streams push), E6 (hot data is direct), E7 for `ipcRenderer` (only `preload/index.ts`), E8 for the version handshake (`apiVersion`, `version-mismatch`), E10 (`AbortSignal` everywhere, sidecar `abort` op), E12 for stale streams (`X-SpeakKit-Replace`), E4 for the stream queue (`maxQueue` 8, `429 busy`), export jobs (16) and `speak-proxy` (`MAX_OPEN_REQUESTS`).

### 2.5 Performance

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G31 | F1, F5, D16, A8 | `docs/perf.md` is a measurement report. Budgets live as assertions in `e2e/tests/perf.spec.ts`, `apps/extension/src/budget.test.ts`, `apps/desktop/tests/perf.test.ts`, but there is no table mapping each feature to budget, code guardrail and named test, and several limits are "informational". | Add a "Performance contract" table to `perf.md`: feature, budget, guardrail in code, test name, tier (CI or dev machine). Rows without a test are listed as gaps and get one. | 2, 13 | — |
| G32 | F2, F3, T21 | One CI job runs everything; the perf phase is skipped there (`E2E_SKIP_PERF=1`); a release does not require a green absolute-budget run. | Split `ci.yml` into a fast pull-request job and a main job; add `nightly.yml` (tsc drift, audit); add `pnpm run release:check` that runs the perf phase on the dev machine and writes `docs/perf-runs/<version>.json` with the commit sha; `release.yml` fails when that file for the tag is missing. | 1, 13 | — |
| G33 | F6 | Extension bundles have gzip budgets (`budget.test.ts`); the desktop renderer has none (`apps/desktop/tests/bundle.test.ts` only checks that test flags are stripped). Three renderer entries: main, mini, panel. | Gzip budget per entry from the current build plus 10 %. | 11 | — |
| G34 | F8 | No static performance lint. | Lint rules: no `execSync`/`spawnSync` in runtime code, no `*Sync` file calls after startup (G03), no `Atomics.wait`, no `setInterval` below 1000 ms (all current uses are 1000 ms or more). | 1 | — |
| G35 | F4 (N7), F7 | Hidden-window polling and private bytes are asserted; idle CPU is not. | In `apps/desktop/tests/perf.test.ts`, assert CPU use stays under 1 % over 60 s with the window hidden (`process.cpuUsage` deltas or `app.getAppMetrics`), and no timer faster than 1 Hz is active. | 11 | — |

Followed: F7 for memory (private bytes under 150 MB, working set under 200 MB, asserted), F14 (hidden things stop: window destroyed after 30 s, offscreen document closes 60 s after stop), F17 for payload sizes (2 MB body cap, 40 MB clone cap).

### 2.6 Coding practices

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G36 | C2 to C7 | The only lint rules are the two import patterns plus oxlint defaults. The Ostio limits would flag the numbers in section 1. No ratchets. | WP-1 adds the limits and a shrink-only ratchet with one baseline file per package (`code/.ratchet/<package>.json`); every package work package lowers its own file to zero for complexity, depth, parameters, nested ternary, files over 300 lines and functions over 50 lines. Components over 50 lines are split, not exempted. | 1, all | — |
| G37 | C25 | `as any` 10 and `as unknown as` 31 in non-test code, none with a reason comment. | Each gets a typed fix or a one-line reason; the ratchet counts them. | 1, all | — |
| G38 | C9 to C11, G22 | The de-slop pass has not been run. Suspected: three layers for one screen (`app/popup/Popup.tsx`, `PopupApp.tsx`, `connection/popup-view.ts`), `shared/engines.ts` next to `shared/engine-view.ts`. Not verified. | Run the pass after wave 2 (steps in `ostio-practices.md` G22). | 16 | — |
| G39 | C18, C19 | The prior-art search rule exists in `code/CLAUDE.md`; there is no verdict field in a brief, no licence table, and the LAME (LGPL) exception is recorded only in `0001-stack.md`. | Add the brief template with `prior-art`, `perf`, `load` fields and the licence table to `CONTRIBUTING.md`. | 2 | — |

Followed: C15 (zero TODO, FIXME or HACK in source), C22 (`__TEST__` build flags compiled out and asserted), C23 for dead code (knip in CI), C24 (36 files use injected clocks or fake timers), C28 (valibot at IPC, env, settings and HTTP bodies), C4 (no `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`).

### 2.7 Naming

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G40 | N2, N5, D15 | No glossary. Terms in use that drift: reading, document, doc, item, queue item, block, sentence, engine, voice, hold, warm, idle unload, replace group, pairing token. | `docs/glossary.md` with concept, code term, user-facing term; rename only when two code terms clash. | 2 | — |

Followed: N6 (`speakkit` in code, "Speak Kit" as display name), N7 (Conventional Commits, `.githooks/commit-msg`).

### 2.8 Errors

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G41 | R1 to R4, R8, R10 | The error model is not written down. 31 swallowing catch sites in non-test code, for example `packages/player/src/player.ts` 3, `extension/src/app/background/state.ts` 3, `server/src/routes/engines.ts` 2, `engine/src/lifecycle.ts` 2, `desktop/main/updates.ts` 2, `server-lifecycle.ts` 2, `server/src/server.ts` 1, `routes/status.ts` 1. | Write the model in `docs/architecture.md` (five rules, the closed `ErrorCode` list and where to update when a code is added). Each swallowing site gets typed handling or a one-line comment saying why ignoring is right; the ratchet counts them. | 2, all | — |
| G42 | R9, L7 | English text crosses IPC and renders: `main/export/jobs.ts:126` and `mp3-worker.ts:9` (`e.message`), `main/reader/controller.ts:211`, `main/library/service.ts:22-23` and `parse/index.ts:54` (`ImportError.message`, `e.message`), `speak-proxy.ts:46`. Server error bodies carry `message` as a diagnostic and the extension maps by `code` (`ERROR_TEXT`), which is correct. | Carry `{ code, args }` through `shared/{ipc,export,reader,library/contract}.ts`; one renderer module maps codes to the same English text, so tests keep their literal strings. | 14 | I |
| G43 | R13 | Not verified that every `ERROR_CODES` entry is produced by a test and has an `ERROR_TEXT` entry. | One test in `protocol` lists `ERROR_CODES`; one in the extension fails when a code has no text; one in server tests produces each HTTP error code. | 3, 10, 4 | — |

Followed: R5 (valibot validates IPC arguments, env, settings, request bodies and responses), R7 (user-actionable conditions have their own codes: `app-not-running`, `token-rejected`, `engine-not-ready`, `page-unreadable`, `file-access`, `busy`, `clip-rejected`), R11 for cancellation as `AbortError`.

### 2.9 Testing

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G44 | T1, U6 | No property tests; `fast-check` is not a dependency. | Optional: add `fast-check` (MIT) for the sentence splitter, queue, timeline and new reducers. Needs a stack entry (decision D2). | 6, 9, 12 | D |
| G45 | T5 | Fakes are scattered: `engine/src/fake.ts`, `desktop/main/updates-fake.ts`, `renderer/app-state.fixture.ts`, `extension/src/testing/*`. No per-feature `testing.ts`. | Add `testing.ts` only where a feature has two or more fakes; do not create empty ones. | 8, 9, 12 | — |
| G46 | T7 | Fault injection is partial. Missing: model host killed mid-stream in process mode, sidecar killed mid-synthesis, write error during export, update download interrupted, port busy at start. | One test each, using injected failures at the boundary (fake spawn, fake fs, fake updater). | 4, 5, 11 | — |
| G47 | T8 | Hostile fixtures exist for URL import (`public-fetch.test.ts`, `fetch-url.test.ts`) and for server Origin, Host and token. Missing for documents: zip bomb and path-traversal DOCX or EPUB, truncated PDF, 8 MB HTML. | Fixtures under `main/library/parse/fixtures/` (already ignored by the formatter) and tests that expect `ImportError` with the right reason and a bounded time. | 11, 13 | — |
| G48 | T12 | No leak assertions. | Helper that counts active timers and listeners; assert zero after `dispose`/`close` in player, server, offscreen document and window classes. | 4, 6, 10, 11 | — |
| G49 | T19, T22, T23 | No integrity check for skipped tests or loosened budgets; no canaries. | `check-integrity.mjs`: fails on new `.skip`/`.only`/`@ts-nocheck`, on a ratchet baseline that grew, and on a numeric budget in the three budget tests that is higher than in the committed contract table. Canary fixture per check. | 1 | — |

Followed: T2, T3, T4, T6, T10, T11 (partly, see G31), T13, T14, T20 (every script in `package.json` runs in CI except `e2e:full`, which needs the real model), T22 (the four skips are opt-in suites), T24.

### 2.10 Security and privacy

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G50 | S1, S18 | No threat model. | `docs/threat-model.md`: threat, defence, cost (other web pages calling the loopback server, malicious documents and URLs, tampered update, compromised dependency, local process reading the token file). | 2 | — |
| G51 | S3 | No `session.setPermissionRequestHandler` or `setPermissionCheckHandler` (Electron then grants every request). The renderer loads with `loadFile` (`main-window.ts:141`, `windows.ts:59`), i.e. `file://`. CSP is a `<meta>` tag per page (acceptable). | Deny every permission request in the secure-window factory; test with a requested `media`, `geolocation`, `notifications` permission. Custom protocol instead of `file://` is optional (decision D8): it changes the page origin and resets `localStorage`. | 11 | B |
| G52 | S4 | No Electron fuses. `electron-builder.yml` sets `asar: false` (native modules and the model host load from disk), so the two asar fuses do not apply. `RunAsNode` must stay on while `packages/engine/src/kokoro.ts:70` uses `child_process.fork` inside Electron; Electron's documentation says turning it off breaks `fork`. | Through `electron-builder.yml` `electronFuses`: `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on. Record the `RunAsNode` exception in an ADR with the follow-up: pass a `spawnHost` function into `createKokoroEngine` so Electron can use `utilityProcess.fork`. | 11 | B |
| G53 | S6 | The pairing token is stored in `<dataDir>/token` (mode 0600 has no effect on Windows) and in `chrome.storage.local`. Ostio keeps secrets in the OS keychain only. | Decision D5: the token is a loopback pairing secret shared with an extension and the standalone CLI, and the server also checks Origin and Host; record it as an accepted risk in an ADR. | 2 | D |
| G54 | S7 | URL import has an 8 MB cap and local files a size cap (`MAX_FILE_BYTES`), but DOCX and EPUB zips have no entry-count or uncompressed-size cap before parsing, and OCR image decode (`renderer/features/reader/ocr.ts`) has no pixel limit. | Check the zip central directory before handing bytes to mammoth or the epub parser (at most 10,000 entries, 200 MB uncompressed, ratio at most 100); cap OCR page pixels. | 11, 12 | — |
| G55 | S9 | `packages/engine/src/chatterbox/detect.ts` runs `nvidia-smi`, `python` and `uv` by bare name. | Resolve once to an absolute path (`where` output), store it in the engine state, spawn that path. | 5 | — |
| G56 | S10 | `env: { ...process.env, ... }` in `kokoro.ts:74` and `chatterbox/engine.ts:226`. | `childEnv(extra)` allowlist: PATH, SystemRoot, SystemDrive, windir, TEMP, TMP, USERPROFILE, APPDATA, LOCALAPPDATA, ProgramData, NUMBER_OF_PROCESSORS, CUDA_*, HF_*, PYTHON*, UV_*, PIP_*, plus the Speak Kit variables. Test the real model host and one manual Chatterbox install and synthesis; if a variable is missing, add it. | 5 | B |
| G57 | S12 | The release is not code-signed (`release.yml` header comment; `testing.md` lists SmartScreen as untested). | Decision D6: signing needs an account and money; record the state in an ADR and revisit. | 2 | D |

Followed: S2 (sandbox, contextIsolation, no node integration, window open denied, navigation blocked), S5 (token with `timingSafeEqual`, Origin and Host checks, `allowedExtensions`; IPC sender check plus valibot arguments in `registerValidatedIpc`), S8 (`shared/deeplink.ts` validates `speakkit://` input; tests exist), S13 (updater runs only in packaged builds, first check delayed, then daily, user setting), S14 for "no analytics".

### 2.11 i18n, accessibility, theming

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G58 | L1 to L8, L13 | No localization system. 351 JSX text literals outside tests; at least 10 manual plural branches (`LibraryPage.tsx:135,212`, `shared/quit.ts:11,15`, `shared/tray.ts:32`, `Popup.tsx:370`, `QueuePanel.tsx:77`, `ShortcutsSection.tsx:42`); five `toLocale*String` calls. | Decision D1. Recommended: stay English-only, record it in an ADR, and do the cheap preparation inside the other packages: one `plural(count, one, other)` helper built on `Intl.PluralRules` in `packages/protocol/src/format.ts` (next to `clock`), `Intl` formatters for dates and numbers. The full catalog work is WP-17. | 3, 9, 12, 17 | D |
| G59 | L9 | Desktop global hotkey defaults `Ctrl+Alt+S`, `Ctrl+Alt+Space`, `Ctrl+Alt+X`, `Ctrl+Alt+C` (`apps/desktop/src/shared/shortcuts.ts:7-10`). Ctrl+Alt is AltGr on German, Polish and French layouts; on a Polish programmer layout AltGr+S, C, X type ś, ć, ź. The extension's Chrome commands (`Ctrl+Shift+S/Y/X`) are fine. | Decision D4. If the user wants the rule applied: change the defaults for new installs only (stored bindings stay). | 12 | B, D |
| G60 | L10 | 52 physical CSS lines in 6 source files (`launcher.css` 14, `compose.css` 11, `lumen.css` 9, `reader.css` 8, desktop `shell.css` 6, content `shell.css` 4); `dir` is not set on `<html>`; document titles and other user text have no `dir="auto"`. Some are intentional (the launcher side setting is physical: left or right edge of the screen). | Convert to logical properties where the meaning is "start or end"; keep and comment the physical ones. Add `code/scripts/check-css.mjs` (grep for physical properties with an allow-list comment marker) instead of stylelint (decision D2). Add `dir="auto"` on document titles in the library and reader. | 7, 8, 9, 12 | — |
| G61 | L12 | `localeCompare` for sorting at `renderer/features/library/model.ts:60` and `features/settings/SitesSection.tsx:38`. | One shared `compareNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare` exported from `packages/protocol/src/format.ts`. | 3, 9, 12 | — |
| G62 | L15 | `prefers-reduced-motion` and `forced-colors` are handled (4 and 5 blocks). `prefers-contrast` and `prefers-reduced-transparency` are not; there is no UI scale setting (200 percent zoom is tested). | Add the two media queries to `lumen.css` where blur or translucency is used; skip the UI scale setting unless the user asks. | 7 | — |

Followed: L14, L16 (axe in `a11y.spec.ts` for popup, options, side panel, in-page UI; keyboard and modes specs), L17 (`tokens.ts` generated from `lumen.css` with a test), L2 and L3 as far as `Intl.Segmenter` and time formatting go.

### 2.12 Docs and ADRs

| ID | Rules | Where | Change | WP | Flag |
|---|---|---|---|---|---|
| G63 | D3 to D8 | `docs/decisions/0001-stack.md` is the only record; it holds per-agent sections, no status, no numbering scheme, no review date, no evidence field, no labels. | Add `docs/decisions/TEMPLATE.md` (Ostio template); add status, date and labels to 0001; new decisions from now on are `0002-…`. First ADRs to write: English-only (D1), RunAsNode exception (G52), token at rest (G53), unsigned release (G57), hotkey defaults (G59), tsrs as sole gate (G21). | 2 | — |
| G64 | D1, D12 | `code/CLAUDE.md` has 8 rules; none names its enforcer or origin; the source-of-truth order is not stated. | Rewrite to at most 25 rules, each "rule. (enforced by: tool) (origin)"; add the precedence order and the "ask the user only for" list. Add a size check. | 2 | — |
| G65 | D10, D11, D13 | Dependency decisions are in `package-audit.md` and `0001-stack.md` without a fixed shape; no lessons file. | Intake template in `docs/decisions/` (status, problem, hard criteria, cost, lock-in, recommendation); `docs/engineering/lessons.md` with the graduation order. | 2 | — |
| G66 | D17, D20 | `architecture.md` has no "applies to" line, no decided/open split; commits carry no `Design:` or `ADR:` trailer. | Add the header block and a sources footer; document the two optional trailers in `CONTRIBUTING.md`. | 2 | — |

Followed: D1 for the existence of a design source (`designs/`), D16 in part, D19 (`testing.md` ends each run with what was not run), D20 for Conventional Commits.

## 3. Rules that do not apply

Not repeated here; each is marked N/A with its reason in `ostio-practices.md`. In short: Rust core and napi, extension hosts and SDK, app modes, system surfaces, licence tokens, registry and kill list, listing and watcher data plane, Effect, React Compiler (until adopted), virtualized lists (until the library grows), Weblate and seven locales, platform vocabulary (Windows only), holdout scenarios, weekly self-improvement loop.

## 4. Work packages

### 4.1 Overview

Priority: P0 unblocks the rest, P1 fixes correctness or security, P2 is structure, P3 is last or optional. Size is agent-hours for one implementer plus the fix-up from one review round. Risk is the chance a behaviour regression reaches users if the checks pass.

| WP | Name | Wave | Pri | Size | Risk |
|---|---|---|---|---|---|
| 1 | Gates and ratchets (tooling, CI, dependency policy) | 0 | P0 | 8 h | low |
| 2 | Docs, ADRs, glossary, generators | 0 | P0 | 8 h | low |
| 3 | `packages/protocol` | 1a | P0 | 3 h | low |
| 4 | `packages/server` | 1b | P1 | 8 h | medium |
| 5 | `packages/engine` | 1b | P1 | 10 h | medium-high |
| 6 | `packages/player` | 1b | P2 | 6 h | medium |
| 7 | `packages/ui` | 1a (task 1), 1b | P2 | 7 h | low-medium |
| 8 | Extension: content script and in-page UI | 1b | P2 | 12 h | high |
| 9 | Extension: React surfaces (popup, options, side panel) | 1b | P2 | 12 h | high |
| 10 | Extension: background, offscreen, shared | 1b | P2 | 5 h | medium |
| 11 | Desktop main process, preload, packaging | 1b | P1 | 16 h | high |
| 12 | Desktop renderer and shared contracts | 1b | P2 | 18 h | high |
| 13 | e2e suite and release gate | 1b | P3 | 6 h | low |
| 14 | Desktop errors as code and arguments | 2 | P3 | 8 h | medium |
| 15 | Switch on enforcement (strict flags, boundary rules) | 2 | P2 | 2 h | low |
| 16 | De-slop pass, regenerate docs, final review | 3 | P3 | 6 h | low |
| 17 | Localization (optional, blocked on decision D1) | — | — | 28 h | medium |

Total without WP-17: 135 h. Wave 1b has 11 packages; run them in two batches (section 5, D10).

### 4.2 File ownership (no two packages edit the same file)

| WP | Owns | Must not edit |
|---|---|---|
| 1 | `code/vite.config.ts`, `code/pnpm-workspace.yaml`, `code/pnpm-lock.yaml`, every `package.json`, `code/knip.json`, `code/package.json` scripts, `code/scripts/check-*.mjs`, `code/scripts/canary/**`, `code/.ratchet/**`, `.github/workflows/{ci,nightly}.yml` | tsconfig files, `release.yml` |
| 2 | `docs/**` except the two files in `docs/engineering/`, `code/CLAUDE.md`, `code/CONTRIBUTING.md`, `code/scripts/gen-docs.mjs` | code |
| 3 | `code/packages/protocol/**` | everything else |
| 4 | `code/packages/server/**` | `package.json` |
| 5 | `code/packages/engine/**` | `package.json` |
| 6 | `code/packages/player/**` | `package.json` |
| 7 | `code/packages/ui/**` | `package.json` |
| 8 | `apps/extension/src/app/content/**`, `src/features/{launcher,player,highlight,reader}/**`, `src/testing/**` | `src/shared/**` |
| 9 | `apps/extension/src/app/{popup,options,sidepanel}/**`, `src/features/{connection,settings,queue,voices}/**` | `src/shared/**` |
| 10 | `apps/extension/src/app/{background,offscreen}/**`, `src/shared/**`, `manifest.json`, `src/budget.test.ts`, extension `vite.config.ts` | feature folders |
| 11 | `apps/desktop/src/main/**`, `src/preload/**`, `scripts/**`, `tests/**`, `electron-builder.yml`, desktop `vite.config.ts` | `src/shared/**`, `src/renderer/**` |
| 12 | `apps/desktop/src/renderer/**`, `apps/desktop/src/shared/**` | `src/main/**` |
| 13 | `code/e2e/**`, `.github/workflows/release.yml` | app code |
| 14 | the desktop files listed in G42 (after 11 and 12 merged) | — |
| 15 | `code/tsconfig.base.json`, boundary rules in `code/vite.config.ts` (after 1 and all others merged) | — |
| 16 | `docs/MODULES.md`, `docs/LAYERS.md`, cleanup cards | — |

Each package keeps its own baseline file in `code/.ratchet/` and lowers only that file. `tsconfig.json` files of each package belong to the package's work package, but flags are switched on only in WP-15 (a package work package proves its sites compile with a scratch tsconfig that extends the project one).

Cross-package dependencies inside wave 1: WP-3 adds `plural` and `compareNames` to `packages/protocol/src/format.ts`, and WP-7's first task adds `ErrorBoundary` to `packages/ui`. Both are about two hours; merge them before WP-9 and WP-12 use them (wave 1a). If WP-11 needs a change in `apps/desktop/src/shared/`, it asks WP-12; if WP-8 or WP-9 needs a change in `apps/extension/src/shared/`, it asks WP-10.

### 4.3 Packages

Every package below has the same acceptance base: `pnpm run typecheck`, `pnpm exec vp lint`, `pnpm exec vp test run <its path>`, `pnpm run knip`, and `node scripts/check-ratchet.mjs <its scope>` showing its baseline lowered. Only the extra proof is listed. "Behaviour" says what a user could notice.

**WP-1 Gates and ratchets** (G09, G12, G15, G18, G19, G21, G24, G32, G34, G36, G37, G49)
- Goal: the Ostio limits are enforced and cannot get worse.
- Changes:
  1. `code/vite.config.ts` `lint`: add the rule set in section 1, import-restriction overrides from G12 (electron, node built-ins, `ipcRenderer`, global `chrome`), `react/rules-of-hooks` and `react/exhaustive-deps`. Overrides turn `node/no-sync` and `no-console` off for `scripts/`, `cli.ts`, tests and `e2e/`.
  2. `scripts/check-ratchet.mjs`: runs `vp lint -f json`, counts per package and rule, plus greps for `as any`, `as unknown as`, `oxlint-disable`, swallowing catches; compares with `.ratchet/<scope>.json`; fails on an increase or on a baseline that is higher than the real count. Generate the baselines from the numbers in section 1.
  3. `scripts/check-deps.mjs` (G19), `scripts/check-css.mjs` (physical properties without an allow marker), `scripts/check-network.mjs` (G09), `scripts/check-integrity.mjs` (G49).
  4. `pnpm-workspace.yaml`: catalog, `minimumReleaseAge: 10080`; exact pins in every `package.json`; `knip` as a pinned dev dependency; regenerate the lockfile once.
  5. CI: split `ci.yml` into a pull-request job (typecheck, lint, ratchet, fmt, knip, deps check, docs check, unit tests) and a main job (adds build, fast e2e, packaged smoke). `nightly.yml`: `tsc --noEmit` per project (non-blocking) and `pnpm audit`.
  6. A canary fixture per custom check and one test that each check fails on its fixture.
- Risk: low; pins can pull different transitive versions when the lockfile is regenerated, so run the whole test suite once.
- Proof: CI green on a branch; each canary fails its check; `pnpm install --frozen-lockfile` works.
- Behaviour: none.

**WP-2 Docs, ADRs, glossary, generators** (G05, G09, G15, G19, G26, G39, G40, G41, G50, G53, G57, G63 to G66)
- Goal: the written system matches Ostio's: decisions with evidence, one vocabulary, generated navigation docs.
- Changes: `docs/decisions/TEMPLATE.md` and status headers; ADRs 0002 to 0007 for D1 (English only), RunAsNode exception, token at rest, unsigned release, hotkey defaults, tsrs as sole gate (only for the decisions the user confirms); `docs/glossary.md`; `docs/privacy.md`; `docs/threat-model.md`; process table and error model in `docs/architecture.md`; "Performance contract" table in `docs/perf.md`; `docs/state-matrix.md`; `docs/engineering/lessons.md`; intake template; rewrite `code/CLAUDE.md` (at most 25 rules, each with enforcer and origin, precedence order, "ask the user only for" list); `CONTRIBUTING.md` brief template; `scripts/gen-docs.mjs` producing `docs/MODULES.md` and `docs/LAYERS.md` with `--check`.
- Risk: low.
- Proof: `node scripts/gen-docs.mjs --check` passes; every dependency is named in a decision record (`check-deps`); a reader can answer "which process does X run in" from the table.
- Behaviour: none.

**WP-3 `packages/protocol`** (G13, G20, G28, G43, helpers for G58 and G61)
- Changes: named exports and an interface header in `src/index.ts`; golden byte fixtures for every frame type and one request body per route; a test listing `ERROR_CODES` and a comment at `api.ts:86` naming every place to update when a code is added; a surface test that snapshots the exported names; `plural()` and `compareNames` in `format.ts`; fix 4 `exactOptionalPropertyTypes` sites; `API_VERSION` N-1 note.
- Risk: low. Proof: `vp test run packages/protocol`; consumers still typecheck (`pnpm run typecheck`).
- Behaviour: none; no wire change.

**WP-4 `packages/server`** (G03, G08, G13 n/a, G14, G20, G29, G30, G43, G46, G48)
- Changes: request-path fs calls to `fs/promises`; `engine.json` corrupt file moved to `.bad` with defaults; deadlines per G29 (control routes 8 s, stream idle 30 s); rename `tests/helpers.ts` to `harness.ts`; fault tests (engine throws mid-stream, client disconnect, write error during export, queued stream replaced); leak test after `close()`; one test per HTTP error code; reserve one slot for interactive streams (only if D9 is yes); fix 27 `exactOptionalPropertyTypes` sites and the lint violations (16 sync calls, 2 long functions, 2 complexity, 2 params, 1 ternary); remove `shell: true` from `tests/pack.test.ts`.
- Risk: medium (timeouts). Proof: `vp test run packages/server`; `pack.test.ts`; `pnpm run e2e` `lifecycle.spec.ts`, `system.spec.ts`; a manual 20 minute read with the fake engine and the stream idle timeout set to 30 s.
- Behaviour: a stalled stream now ends with `synthesis-failed` after 30 s; exports may wait for interactive reads (if D9).

**WP-5 `packages/engine`** (G03, G04, G08 n/a, G13, G20, G29, G46, G55, G56)
- Changes: `child-env.ts` allowlist used by `kokoro.ts` and the Chatterbox spawns; crash-loop guard (3 in 5 minutes) in `lifecycle.ts`; heartbeat deadlines and process-tree kill for installer and sidecar; resolve `nvidia-smi`, `python`, `uv` to absolute paths once; `platform.ts` for the one `process.platform` check; async `voice-store.ts`; split `chatterbox/engine.ts` (330 lines) into install and sidecar modules; interface header and named exports; fix 14 `exactOptionalPropertyTypes` sites and the lint violations (14 sync, 5 ternaries, 5 params, 1 complexity, 1 long function); fault tests for host killed mid-stream and sidecar killed mid-synthesis.
- Risk: medium-high: the environment allowlist and the tree kill cannot be fully tested in CI (Chatterbox needs an NVIDIA GPU and Python).
- Proof: `vp test run packages/engine` (lifecycle, worker-init); `SPEAKKIT_REAL=1` real-model test; `pnpm run e2e:full` `full.spec.ts`; a manual Chatterbox install, synthesis and cancel run recorded in `docs/testing.md`.
- Behaviour: after three crashes in five minutes the engine stops restarting by itself; child processes see a smaller environment.

**WP-6 `packages/player`** (G13, G20, G48)
- Changes: replace the 8 parameter properties; fix 20 `exactOptionalPropertyTypes` sites; move the state transitions of `player.ts` (400 lines) into a pure `transition(state, event)` table with an exhaustive check and table tests; keep `player.ts` under 300 lines; dispose test asserting no timers or listeners remain (the injected `setInterval` makes this direct); header and named exports; lint (3 params, 2 complexity).
- Risk: medium (playback core). Proof: `vp test run packages/player`; `pnpm run e2e` `playback.spec.ts`, `ui.spec.ts` (gapless scheduling, 250 jumps under 8 MB); `budget.test.ts`.
- Behaviour: none.

**WP-7 `packages/ui`** (G11, G13, G20, G23, G25, G60, G62)
- Task 1 (first, merge fast): `ErrorBoundary` component with "Reload" fallback, exported from `index.ts`.
- Then: staleness tests for `icon-data.ts` and `logo-data.ts`; split `vanilla.ts` (378 lines, 6 ternaries) by component; `--lm-dur-*` tokens for the four loops; logical properties in `lumen.css` (9 lines); `prefers-contrast` and `prefers-reduced-transparency` blocks; named exports in `index.ts`; fix 11 `exactOptionalPropertyTypes` sites; `shell: true` removal in `tests/browser.test.ts` and `scripts/compare.ts`; exclude `gallery/` from lint.
- Risk: low-medium. Proof: `vp test run packages/ui` (`parity.test.tsx`, `tokens.test.ts`); visual harness `e2e/visual` shows no diff; `budget.test.ts`.
- Behaviour: none visible; high-contrast mode may change colours where blur was used.

**WP-8 Extension: content script and in-page UI** (G13, G16, G20, G22, G25, G36, G45, G60)
- Changes: split `app/content/controller.ts` (773 lines, complexity 33 at line 602) by responsibility; `features/reader/collect.ts:102` (complexity 44) into a rule table and small predicates; state tables for launcher, edge and dock states (`edge.ts` 353 lines, `dock.ts` 326 lines with 8 ternaries, `bubble.ts`); replace parameter properties in these features (about 14); import `ReaderSettings` from `../settings` in `reader/view.ts`; named exports and headers for `highlight`, `reader`, `launcher`, `player` indexes; logical CSS in `launcher.css`, `shell.css` where the meaning is start or end; lint share of the extension.
- Risk: high: this is the injected UI. Content bootstrap must stay under 16 KB gzip.
- Proof: component tests under linkedom; `pnpm run e2e` `content`, `ui`, `keyboard`, `modes`, `a11y`, `playback` specs; `budget.test.ts`; `perf.spec.ts` (5,000 paragraphs under 50 ms longest stall).
- Behaviour: none.

**WP-9 Extension: React surfaces** (G12, G13, G20, G22, G23, G24, G36, G58 prep, G60, G61)
- Changes: popup state as a discriminated union with a pure `derivePopupView`/reducer and an exhaustive switch (`Popup.tsx` 483 lines, complexity 55; `PopupApp.tsx`; `connection/popup-view.ts`; `ConnectionCard.tsx`); same for `QueuePanel.tsx`, `SitesSection.tsx`, `VoiceSection`/`VoiceList`; `ErrorBoundary` at the popup, options and side-panel roots; `features/settings/browser.ts` as the only file that calls `chrome.*` in settings; use `plural()` and `compareNames`; fix the `exhaustive-deps` site; `dir="auto"` on page titles; replace `export *` in `voices/index.ts`; erasable and exact-optional sites in these features; lint share.
- Risk: high (popup states are the most-tested screens). Proof: component tests; `pnpm run e2e` `popup`, `options`, `a11y`, `keyboard`, `modes`, `system`, `pairing` specs; the state list in `docs/testing.md` each still has a test.
- Behaviour: none; strings identical.

**WP-10 Extension: background, offscreen, shared** (G13, G20, G29, G41, G43, G48)
- Changes: turn `background/router.ts:26` (complexity 34) into a handler table keyed by the message type from `shared/schemas.ts`, each handler under 50 lines; typed handling or a reason comment for the three swallowing catches in `state.ts`; an `ERROR_TEXT` completeness test against `ERROR_CODES`; deadline on the offscreen server fetch; leak test for the offscreen player lifecycle; remaining exact-optional and erasable sites in `shared/` and `background/`.
- Risk: medium (service worker suspends; state is mirrored in `chrome.storage.session`). Proof: `background/router.test.ts` (state survives a worker restart); `pnpm run e2e` `system`, `lifecycle`, `pairing`.
- Behaviour: none.

**WP-11 Desktop main** (G01, G02, G03, G05, G06, G07, G08, G10, G11, G27, G33, G35, G46, G47, G48, G51, G52, G54)
- Order of work: (1) permission handlers, `spellcheck: false`, `webSecurity: true` in `secure-window.ts`; (2) fuses in `electron-builder.yml`; (3) parsers into a worker; (4) failing tests then `.bad` handling for `config.json` and `library.json`; (5) zip and image caps; (6) sync fs to promises in `handlers.ts` and `server-lifecycle.ts`; (7) tests: event-loop delay, idle CPU, renderer bundle budgets, hostile document fixtures, process-count assertion in `scripts/smoke-packaged.mjs`, staleness test for `main/icon-data.ts`; (8) split `main/desktop.ts:49` (174 lines) into reading, exports and updates wiring; (9) tail: startup marks, publish coalescing, JSON logs; (10) lint share (34 long functions, 13 complexity, 36 ternaries, 14 params across desktop; roughly half is in `main/`).
- Risk: high: Electron, packaging, native modules.
- Proof: `vp test run apps/desktop` (smoke, shell, system, reader, bundle, perf); `scripts/smoke-installer.mjs` and `smoke-packaged.mjs` on the built installer; `pnpm run e2e:full` `desktop.spec.ts`; a manual check that clipboard reading, tray and launch at login still work after the permission change.
- Behaviour: window permission requests are denied; a corrupt config starts with defaults and a notice instead of failing; state events are batched per frame.

**WP-12 Desktop renderer and shared** (G13, G16, G17, G20, G22, G23, G24, G36, G54, G58 prep, G59, G60, G61)
- Changes: reducers for `App.tsx` (13 state values), `ExportDialog.tsx`, `Wizard.tsx`, `Reader.tsx`, `AddDialogs.tsx`, `LibraryPage.tsx`, `pages.tsx`, `EnginesPage.tsx`; `shared/engines.ts` as a table; make wizard, settings, export, engines, updates and palette features with an `index.ts`; break the library and reader cycle (reader imports `../library` only; route composed in `App.tsx`); `ErrorBoundary` in `main.tsx`, `mini.tsx`, `panel.tsx`; fix the 5 `exhaustive-deps` sites; use `plural()` and `compareNames` (`library/model.ts:60`, `shared/quit.ts`, `shared/tray.ts`, `LibraryPage.tsx`); OCR pixel cap; logical CSS in `reader.css` and `shell.css`; `dir="auto"` on titles; `export *` in `shared/library/contract.ts`; if D4 is no, new default hotkeys in `shared/shortcuts.ts`; erasable (19) and exact-optional (47) sites in renderer and shared; lint share.
- Risk: high (largest UI surface). Proof: component and `tests/*.test.ts` Electron suites; `pnpm run e2e` desktop specs; visual harness `e2e/visual` desktop states; axe specs.
- Behaviour: none, except hotkey defaults if D4 is no.

**WP-13 e2e and release gate** (G31, G32, G47)
- Changes: `release:check` script running the perf phase and writing `docs/perf-runs/<version>.json`; `release.yml` fails without it; a hostile-client spec (wrong Origin, wrong Host, wrong token, oversize body) against a real server; long-task trace under 4x CPU throttle for popup open and 5,000-paragraph extraction; remove `shell: true` in `tests/perf.spec.ts`.
- Risk: low. Proof: the new specs pass; a dry run of `release:check` writes the file.
- Behaviour: none.

**WP-14 Desktop errors as code and arguments** (G42) — wave 2
- Changes: `{ code, args }` in `shared/{ipc,export,reader,library/contract}.ts`; main side stops formatting text; one renderer module maps codes to the existing English strings.
- Risk: medium; internal IPC contract changes. Proof: all existing tests pass with their literal strings unchanged; new table test for the mapping.
- Behaviour: none visible.

**WP-15 Switch on enforcement** — wave 2
- Changes: enable `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` in `tsconfig.base.json`; extend the feature deep-import rule to extension `features/**` and desktop `renderer/**`; ratchets for the rules that reached zero become hard errors.
- Risk: low if all package packages are merged. Proof: `pnpm run typecheck` and `pnpm exec vp lint` clean.

**WP-16 De-slop pass and final review** — wave 3
- Changes: run the de-slop steps (practices G22) over the five most-changed features; at most three cards become tasks with `Behaviour change: none`; regenerate MODULES.md and LAYERS.md; fill any empty row of the performance contract; run the review checklist (practices section 14) over the combined result.

**WP-17 Localization (optional)** — only if D1 is no
- Changes: message catalog (`l10n/en/*.json`), compiled ICU messages with `@formatjs/intl`, `t()` in all 351 literal sites, pseudo-locale screenshots, a lint ban on JSX literals. Needs a stack entry and ADR; about 28 hours.

## 5. Decisions needed from the user

Each answer is worded so "yes" accepts the recommendation.

1. **D1 English only.** Stay English-only for now, record it in an ADR, and do only the cheap preparation (`plural()` helper, `Intl` formatters, logical CSS)? (G58; otherwise WP-17)
2. **D2 Dependencies.** Add `fast-check` as a dev dependency for property tests and use a 30-line grep script instead of adding stylelint? (G44, G60)
3. **D3 Fuses.** Turn on `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off and `EnableCookieEncryption` on, keep `RunAsNode` on while the model host uses `fork`, and record that in an ADR? (G52)
4. **D4 Hotkeys.** Keep the four desktop global hotkey defaults (`Ctrl+Alt+S/Space/X/C`) and record the AltGr exception in an ADR, since users can rebind? (G59; "no" means new defaults for fresh installs)
5. **D5 Token at rest.** Keep the pairing token as a file in the data directory and in `chrome.storage.local`, recorded as an accepted risk? (G53)
6. **D6 Signing.** Keep releases unsigned until you have a signing account, recorded in an ADR? (G57)
7. **D7 Deadlines.** Use control routes 8 s, stream idle 30 s, sidecar idle 60 s, installer idle 120 s as the first deadlines? (G29)
8. **D8 Protocol.** Keep loading the renderer from `file://` and skip a custom protocol? (G51)
9. **D9 Lanes.** Reserve one of the two synthesis slots for interactive reads so exports cannot block reading? (G30)
10. **D10 Cost.** Run waves 0 and 1a now, then wave 1b in two batches of five or six agents (about 110 agent-hours in wave 1b)?

## 6. How the work packages run

Rules taken from Ostio's agent workflow (`ostio-practices.md` section 15):

- One work package per session and per branch `agent/wp-<n>`; commit per area with Conventional Commits and push regularly. After a context compaction, re-read the brief and the rule IDs it cites.
- Brief fields: goal, owned paths (section 4.2), gaps closed, rules cited, `Behaviour change: none` unless a flagged gap says otherwise, acceptance commands, not in scope, prior-art verdict (none needed for a refactor, but any new dependency needs one), how to report what was not verified.
- A failing test first for gaps that describe a bug (G08, G47, G46).
- Never loosen a budget, a lint limit, a ratchet baseline or a screenshot baseline to pass; baselines only go down. Do not edit files owned by another package; ask through the planner.
- A separate reviewer run, with only the brief, the diff and the gate output, writes findings first and ticks the checklist in `ostio-practices.md` section 14. After two review rounds the planner re-scopes or parks the package. After two identical failures, stop and report.
- Stop and ask for any change to the wire protocol, a new dependency, or a behaviour change not marked in section 2.
- Each package ends with a report: what changed, the command output that proves it, what was not verified (for example Chatterbox on a real GPU).

## 7. What this survey did not verify

- No Speak Kit tests were run for this plan. The 790 of 796 passing figure comes from an earlier baseline run in a separate checkout; the two failures were timing flakes.
- Counts come from oxlint and tsrs probes in a scratch folder and from grep. Lint counts depend on the exact rule options; the ratchet baselines must be regenerated from the committed config.
- "Followed" claims rest on reading the named files and docs, not on exhaustive review. Not checked: whether the popup draws a cached state before the first health reply (A3), theme-switch re-render cost (F18), whether every desktop queue has a cap (E4 beyond the ones named), the exact behaviour of a corrupt `config.json` and `library.json` (reasoned from the libraries' documented behaviour, to be reproduced as the first step of G08), and the `RunAsNode`/`fork` dependency (taken from Electron's fuse documentation, not tested here).
- Another session edits `code/` during this work; line numbers and counts will have moved.

## 5a. Decisions taken (2026-11-01)

The user accepted all ten recommendations in section 5 (D1 to D10) as worded. Work packages follow them: English only, `fast-check` without stylelint, the three Electron fuses with `RunAsNode` kept on, the four hotkey defaults, the token as a file, unsigned releases, the first deadlines, `file://`, a reserved interactive synthesis slot, and waves 0 and 1a first with wave 1b in two batches. Each needs an ADR from WP-2.
