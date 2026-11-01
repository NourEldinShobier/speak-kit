# ADR 0003: Add fast-check for property tests; check CSS with a script, not stylelint

## Status
Accepted, 2026-11-01. Decision D2 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G44 (T1, U6): there are no property tests, so the sentence splitter, the queue, the player timeline and the new UI reducers are tested with hand-picked examples only. Gap G60 (L10): 52 lines in 6 source CSS files use physical properties where the meaning is "start" or "end". `0001-stack.md` says to add a package only when nothing built in covers the need.

## Decision
1. `fast-check` is added as a dev dependency (root catalog entry, exact version, installed by WP-1) and used for pure functions and reducers: `splitSentences`, the queue, the timeline, `plural`, and every `reduce(state, action)` that work packages 6, 9 and 12 add. Property tests live next to the unit tests, run under `vp test`, and use a fixed seed in CI.
2. Physical CSS properties are found by `code/scripts/check-css.mjs` (a grep of about 30 lines with an allow marker comment for intentional physical values, such as the launcher side setting). `stylelint` is not added.
3. `0001-stack.md` gets one row for `fast-check` when WP-1 lands the dependency; WP-1 owns `package.json` and the lockfile.

## Evidence
- `fast-check` is MIT licensed and has no runtime dependencies in the shipped apps (dev only). Version, release date and size are to be checked by WP-1 when it pins the version; this ADR does not pin one. Not checked here: install size, Vitest integration beyond the library's documented API.
- Physical CSS line counts: refactor plan section 1 (grep, 2026-11-01).
- Not measured: whether a 30-line grep misses cases a real parser would find (shorthand values such as `margin: 0 4px 0 8px` are not caught). Accepted as a known limit.

## Alternatives considered
- Hand-written randomised tests: rejected; shrinking and seed replay are the value of the library.
- `stylelint` with `plugin/use-logical-properties-and-values`: rejected. A config, a plugin and a second tool run for one rule family.
- No property tests: rejected for reducers and parsers, where the state space is the risk.

## Consequences
- One new dev dependency; no change to shipped bundles.
- Guardrail: `scripts/check-deps.mjs` (WP-1) fails when `fast-check` is in a `package.json` but not named in a decision record or not pinned to an exact version. `check-css.mjs` runs in the pull-request job.

## Licence
`fast-check`: MIT, used as a dependency, nothing copied. The CSS script is original.

## Decision-record amendment
`0001-stack.md`, section "Built in (no package)": add a row after "Type checking" once WP-1 pins the version. Old text: none (new row). New text: `| Property tests | fast-check (dev dependency, MIT), see ADR 0003 |`.

## Open questions for the user
None open.
