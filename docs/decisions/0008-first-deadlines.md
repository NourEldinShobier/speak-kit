# ADR 0008: First deadlines for server routes, streams, sidecar and installer

## Status
Accepted, 2026-11-01. Decision D7 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [S]. Exit test: lower or raise a value only from a measured p99 plus margin recorded in `docs/performance-contract.md`; the first revision is due after the first full dev-machine perf run with the deadlines on. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G29 (rules E9, R12, V1): deadlines exist only for the health check (2 s) and URL import. `/v1/speak`, warm, hold, engines and export routes, sidecar requests and installer steps can wait forever, so a stalled engine leaves the UI waiting with no error.

## Decision
Generous first values, no new wire fields and no new error codes:
1. Control routes (health excluded, speak excluded, export download excluded): 8 s.
2. `/v1/speak` stream: ends with the existing `synthesis-failed` error frame after 30 s without a frame.
3. Chatterbox sidecar request: 60 s without a progress line.
4. Chatterbox installer: 120 s without output.
5. Deadlines are measured against an injected clock so tests run in milliseconds. The values are named constants in one module per package, not environment variables.
6. Work packages 4 (server), 5 (engine) and 10 (extension offscreen fetch) implement them; the behaviour change is that a stalled stream now ends with `synthesis-failed` after 30 s.

## Evidence
- Plan G29, existing 2 s health and URL import deadlines in `packages/server` and `apps/desktop/src/main/library`.
- Not measured: real idle gaps during a Chatterbox first-token wait or a pip step on a slow network. The 60 s and 120 s values are estimates [est.], chosen to be longer than anything seen in the manual Chatterbox install on 2026-11-01 (`0001-stack.md`), and are not proven safe for slow connections.

## Alternatives considered
- Shorter values (for example 10 s stream idle): rejected until measured; a cold model load can pause output.
- A per-request deadline from the client in a header: rejected; it is a wire change.
- No deadlines: rejected; the stalled-engine case is the bug.

## Consequences
- A slow but alive engine can be cut off; the user sees the existing synthesis error and retries.
- Guardrail: per-deadline fake-clock tests in `packages/server` and `packages/engine`; a manual 20-minute fake-engine read with the 30 s idle value (work package 4 proof).

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
