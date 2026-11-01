# ADR 0012: tsrs is the only blocking type-check gate

## Status
Accepted, 2026-11-01. Gap G21 of `docs/engineering/refactor-plan.md` records this as an existing Speak Kit decision; this ADR writes it down. It is not one of decisions D1 to D10.

Label: [S]. Exit test: replace tsrs with `tsc` as the blocking gate if the non-blocking nightly `tsc --noEmit` reports an error on `main` that tsrs missed more than once in eight weeks. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
`code/scripts/typecheck.mjs` runs only tsrs (the Rust port of TypeScript 7, `0001-stack.md`: "Type checking"). Ostio's rule P18 prefers a second checker. `code/CLAUDE.md` says to fall back to `tsc` if tsrs fails and to say so.

## Decision
1. `pnpm run typecheck` (tsrs) is the blocking gate in the pull-request and main jobs.
2. The nightly workflow (WP-1) runs `tsc --noEmit` per project as a non-blocking drift check and reports differences.
3. A tsrs crash or false positive is handled by running `tsc` for that project and saying so in the commit or report; no suppression comments.

## Evidence
- `code/scripts/typecheck.mjs`, `code/package.json` (`tsrs 0.20.1-ts7.1.0-beta`), `0001-stack.md`. tsrs is a beta tool [S]; no measured count of tsrs-versus-`tsc` differences exists yet.

## Alternatives considered
- Both blocking: rejected; doubles type-check time on CI for a hypothetical drift.
- `tsc` only: rejected; tsrs is the speed choice already made in `0001-stack.md`.

## Consequences
- Type errors that tsrs misses reach `main` until the nightly job reports them.
- Guardrail: nightly job output (non-blocking) and the exit test above.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
