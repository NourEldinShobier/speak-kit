# ADR 0010: One synthesis slot is reserved for interactive reads

## Status
Accepted, 2026-11-01. Decision D9 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [S]. Exit test: with the fake engine, one export plus two interactive streams started together, the first audio frame of the interactive streams arrives within the existing 600 ms Listen budget while the export is running. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G30 (rules E11, V2): `packages/server/src/stream-queue.ts` shares the same synthesis slots between `/v1/speak` streams and export jobs. A long export can occupy both slots and delay a read the user is waiting for.

## Decision
1. Of the two synthesis slots, one is reserved for interactive streams: an export job may take at most one slot; an interactive stream may take either.
2. An interactive stream queues behind another interactive stream only (and behind an export that already holds the one slot it may use, never both).
3. Queue limits do not change: `maxQueue` 8 and `429 busy` for streams, 16 export jobs.
4. Work package 4 implements it and adds the test named in the exit test. No wire change.
5. Behaviour change: exports may wait while two interactive reads occupy the slots.

## Evidence
- `packages/server/src/stream-queue.ts`, refactor plan G30. Perf budget for Listen: `docs/perf.md` and `e2e/tests/perf.spec.ts` (600 ms with the fake engine).
- Not measured: how often a user starts an export and a read together, and the real export slowdown with one slot, since only the fake engine has been used.

## Alternatives considered
- Separate pools with their own sizes: rejected; the model cannot run more than two syntheses in parallel anyway.
- Priority preemption of a running export: rejected; cancelling work already done wastes it.
- Leave as is: rejected; reading must not wait for a file the user can wait for.

## Consequences
- Exports can take longer when the user reads while exporting.
- Guardrail: the named stream-queue test in `packages/server/tests`.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
