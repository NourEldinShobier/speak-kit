# ADR 0011: Run the refactor in waves, with wave 1b in two batches

## Status
Accepted, 2026-11-01. Decision D10 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
The refactor plan has 16 work packages (about 135 agent-hours) plus the optional localization package. Several agents share one machine (32 cores, 32 GB) and fixed ports, and every package that touches `package.json`, the lockfile, or lint configuration conflicts with the others.

## Decision
1. Wave 0 (gates and ratchets, docs and ADRs) and wave 1a (`packages/protocol`, first task of `packages/ui`) run first and merge to `main` before dependent packages.
2. Wave 1b (server, engine, player, ui rest, extension content, extension surfaces, extension background, desktop main, desktop renderer, e2e) runs in two batches of five or six agents, about 110 agent-hours in total.
3. Wave 2 (desktop errors as code, strict compiler flags and boundary rules) starts after wave 1 is merged. Wave 3 (de-slop, regenerated docs, final review) is last.
4. Each package owns the paths in `refactor-plan.md` section 4.2 and pushes small, finished slices to `main` with fast-forward only.
5. Cost note: more than about six agents at once, or a second large workflow, needs the user's say first (user's standing token-budget rule).

## Evidence
- Plan sections 4.1, 4.2 and 6. The 135-hour figure is an estimate [est.]; no package has been timed.
- Not measured: machine contention when eleven packages run Playwright or Electron at once.

## Alternatives considered
- All wave 1b packages at once: rejected; shared ports and one machine.
- One package at a time: rejected; about 135 sequential hours.

## Consequences
- Later batches rebase onto the earlier batch's changes; conflicts in a file a package does not own resolve to origin's version.
- Guardrail: the CI run on `main` after each push is the full check; a red `main` is fixed before any other merge.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
