# ADR 0014: Event-loop delay in the Electron main process: a 10 ms target and a looser CI gate

## Status
Accepted, 2026-11-02. Reconciles `docs/performance-contract.md` (p99 <= 10 ms) with `apps/desktop/tests/perf.test.ts` (p99 < 50 ms, max < 250 ms).

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
The contract proposed "event-loop delay in Electron main, p99 <= 10 ms" (gap row, work package 11). The test that exists asserts p99 < 50 ms, max < 250 ms and idle CPU < 5 %, and `.ratchet/budgets.json` records those numbers. Nobody wrote down why the two differ, so one of them was wrong or the gate was a silent loosening.

## Decision
1. The contract target stays 10 ms. It is measured as the p99 of the delay histogram minus its median ("excess"), because the histogram records the whole timer interval, not only the delay: on Windows every value includes the timer tick of about 15.6 ms, so the raw p99 of an idle Node process is 17.5 ms and can never be <= 10. Excess removes the tick and keeps the part the app adds.
2. The target is checked by `apps/desktop/tests/perf.test.ts` on a developer machine (the assertion is skipped when `CI` is set). Budget key `apps/desktop/tests/perf.test.ts#excessMs` = 10 in `.ratchet/budgets.json`.
3. The CI gate stays at raw p99 < 50 ms and max < 250 ms, idle CPU < 5 %: a shared 2-vCPU runner can stall a process for tens of milliseconds for reasons outside the app. These numbers are the gate only.
4. Rule: a looser CI gate never replaces the target. The contract lists both numbers in the same row; raising either one needs an ADR; a change to the gate is not a change to the target and vice versa.
5. The target row for "during stream, export and import" stays in the gap table: only the idle window is measured today. Its test is part of work package 11.

## Evidence
Measured on the maintainer's Windows 11 machine, nothing else running, `perf.test.ts` "event loop" with the fake engine and an unloaded model, 5 s idle, three runs each (`monitorEventLoopDelay`, resolution 10 ms unless stated):

| Run | p50 | p99 | excess (p99 - p50) | max | idle CPU |
|---|---|---|---|---|---|
| 1 | 15.6 ms | 20.6 ms | 5.1 ms | 49.5 ms | 0.03 % |
| 2 | 15.5 ms | 16.9 ms | 1.4 ms | 57.9 ms | 0.08 % |
| 3 | 15.5 ms | 18.0 ms | 2.5 ms | 33.7 ms | 0.04 % |

Earlier runs of the same test without the median: p99 20.0, 19.4, 17.5 ms; max 49.6, 42.6, 46.9 ms. With resolution 1 ms: p99 18.5, 16.6, 17.8 ms; max 55.4, 34.1, 66.2 ms. A bare `node` process on the same machine, idle: p50 15.3 to 15.4 ms, p99 17.5 to 17.7 ms at both resolutions, so the floor is the operating system timer, not Electron.

Not measured: Linux and macOS, a shared CI runner, or any run under stream, export or import load. The raw p99 on this machine is 3 times below the CI gate; the maximum is 4 to 7 times below the max gate.

## Alternatives considered
- Raise the contract to 50 ms: hides a real target behind the number a noisy runner needs. Rejected.
- Hold CI to 10 ms: the CI runner would fail on timer noise, and the answer would be a retry loop. Rejected.
- Sample with `resolution: 1`: the floor on Windows stays 15.6 ms, so raw p99 still cannot meet 10.

## Consequences
The test prints `excessMs`; a developer run fails when the app adds more than 10 ms at p99 while idle. CI keeps its numbers. `check-integrity.mjs` compares the new budget key with `.ratchet/budgets.json`.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None.
