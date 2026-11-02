# Performance contract

One row per feature: budget, the guard in code, and the test that fails when the budget is broken. Applies to: Speak Kit v0.3.0, written 2026-11-01 from `docs/perf.md` (measurements and history) and the tests named below. Rule ids F1, F5, D16 in `docs/engineering/ostio-practices.md`. A budget is never raised without an ADR (the integrity check in work package 1 compares the numbers in the three budget tests with this table).

Tiers: **CI** runs on every push (`ci.yml`); **dev** runs on the maintainer's machine (`pnpm run e2e`, `pnpm run e2e:full`) because it needs the full browser suite or the real model. Numbers marked [est.] are estimates, not measured.

## Rows with a test
| Feature | Budget | Guard in code | Test | Tier |
|---|---|---|---|---|
| Listen click to first scheduled audio, fake engine (pipeline overhead) | < 600 ms | Player lookahead of two sentences; the player waits for room before handling each frame | `e2e/tests/perf.spec.ts` "Listen click to first scheduled audio, pipeline overhead" | dev |
| Extraction of a 5,000-paragraph page | longest main-thread stall < 50 ms | One `Intl.Segmenter` pass over all blocks; Ranges built lazily | `e2e/tests/perf.spec.ts` "extraction of 5,000 paragraphs does not block the main thread past 50 ms" | dev |
| In-page script size and injection | `content.js` < 16 KB gzip (budget test), injection < 80 ms | Lazy module body; 15-line guard instead of a schema in the content script | `apps/extension/src/budget.test.ts` ("content.js under 16 KB gzip"); `e2e/tests/perf.spec.ts` "content script: production bundle size and injection cost" | CI (size), dev (injection) |
| Extension bundle sizes (gzip) | popup 123 KB, options 123 KB, side panel 100 KB, offscreen 14 KB, background 8 KB, content-ui 30 KB, worklet 20 KB ; CSS per page 12 KB (source: `BUDGET_KB` and `CSS_BUDGET_KB` in `apps/extension/scripts/sizes.mjs`) | One lazy options chunk; no shared-chunk splitting | `apps/extension/src/budget.test.ts` "every bundle stays within its budget" | CI |
| Popup open to Listen button | < 700 ms | Popup draws from cached state | `e2e/tests/perf.spec.ts` "popup open to interactive" | dev |
| Offscreen memory over a 10-minute read | JS heap growth < 25 MB over 600 paragraph jumps | Players release buffers on stop | `e2e/tests/perf.spec.ts` "offscreen memory over an accelerated 10 minute read" | dev |
| Unloaded model to first audio (real Kokoro) | < 3000 ms; model ready to first audio < 1000 ms | `warm`, lazy load, `hold` while paused | `e2e/tests/perf.spec.ts` "unloaded to first audio on a click without any earlier warm-up, and the warm path" (runs with the real model under `pnpm run e2e:full`) | dev |
| Desktop memory, unloaded model, hidden window | private bytes < 150 MB, working set < 200 MB | Hidden window stops polling; window destroyed after 30 s hidden; GPU and network services in process | `apps/desktop/tests/perf.test.ts` | dev (Electron) |
| Server memory after idle unload | after unload < unloaded + 40 MB | Idle unload of the model host | `e2e/tests/full.spec.ts` "model lifecycle with the real engine: first audio after warm vs cold, memory ready vs unloaded" | dev |
| Event-loop delay in Electron main, window shown and idle (ADR 0014) | Target (dev machine): p99 minus median <= 10 ms. CI gate (shared 2-vCPU runner): p99 < 50 ms, max < 250 ms. Idle CPU of all processes < 5 % | Work on the main thread stays in short slices; parsing and MP3 encoding run in worker threads | `apps/desktop/tests/perf.test.ts` "event loop: p99 delay under 50 ms and max under 250 ms while idle, p99 above the median within 10 ms off CI; idle CPU of all processes under 5%" | CI (gate), dev (target) |
| Hidden-window polling | polling stops while hidden | Timer cleared on hide and minimize | `apps/desktop/tests/shell.test.ts` "a hidden window stops polling health; showing it resumes" | dev (Electron) |

## Gaps (budget needed, test needed)
These rows have no test today. Each is assigned to a work package in `docs/engineering/refactor-plan.md` section 4; the budget shown is the proposed first value and is frozen from the first measured run.

| Feature | Proposed budget | Work package |
|---|---|---|
| Event-loop delay in Electron main during stream, export and import | p99 minus median <= 10 ms, the same target as the idle row (ADR 0014); the CI gate is never the target | 11 (G02) |
| Idle CPU of the desktop app with the window hidden | < 1 % over 60 s, no timer faster than 1 Hz | 11 (G35) |
| Desktop renderer bundle size, per entry (main, mini, panel) | current gzip size + 10 % | 11 (G33) |
| Cold start phases (`main:ready`, `server:listening`, `window:shown`, `renderer:first-paint`) | frozen from the first run [est.] | 11 (G06) |
| Hostile document parse time (zip bomb, truncated PDF, 8 MB HTML) | bounded; `ImportError` with a reason | 11, 13 (G47) |
| Popup open and 5,000-paragraph extraction under 4x CPU throttle | long tasks < 100 ms [est.] | 13 |
| Server deadlines (control 8 s, stream idle 30 s, sidecar 60 s, installer 120 s) | as in ADR 0008 | 4, 5, 10 (G29) |
| Interactive stream during an export | first audio < 600 ms with the fake engine | 4 (ADR 0010) |

## Informational numbers (not budgets)
Real-model first chunk of a 12-word sentence (about 1.4 to 1.6 s on an idle dev machine), time after a stop (up to about 1 s extra, the model cannot be interrupted inside a sentence), installer silent install (39 s), Windows working set of the app (157 to 160 MB). These are in `docs/perf.md`; they become budgets only after an ADR.

## How to add or change a row
1. Add the guard in code and a test that fails when the number is exceeded.
2. Add the row here with the test name; a row with no test goes in the gap table.
3. Raising a budget needs an ADR; lowering one needs only a measured run.
