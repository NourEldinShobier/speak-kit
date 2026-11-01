# Contributing

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), checked by `.githooks/commit-msg` (`git config core.hooksPath .githooks`).

```
feat(player): schedule the next sentence before the current one ends
fix(launcher): keep the pill open while the pointer is over the tooltip
test(extract): cover nested lists
```

Types: `feat fix docs style refactor perf test build ci chore revert`. Scope = feature name. One logical change per commit, tests included.

Optional trailers, one per line before `Co-Authored-By`: `Design: <frame id>` for a UI change (the id of the design frame it implements) and `ADR: <number>` when a decision record governs the change (`ADR: n/a` is allowed).

## Before pushing

```bash
pnpm run fmt              # format (vp fmt); CI runs fmt:check
pnpm exec vp check        # format, lint, types
pnpm exec vp test run     # unit + integration + component
pnpm run e2e              # Playwright fast set (fake engine)
pnpm run e2e:full         # includes the real Kokoro model
node scripts/gen-docs.mjs --check   # docs/MODULES.md and docs/LAYERS.md are current, imports obey the layer rules
```

## Code

- New feature: `src/features/<name>/` with `index.ts`; other features import it only through `index.ts`.
- Shared request/response shapes live in `packages/protocol`; both sides import them.
- Colors, radii and motion come from `packages/ui` and `tokens.css` (Lumen). No hard-coded hex values in components.
- Name every screenshot after its design frame id.

## Decisions and new dependencies

- Decisions live in `docs/decisions/`: copy `TEMPLATE.md` to `NNNN-slug.md` (next free number), set a review date at most 8 weeks out, and answer "ask the user" items with a recommended answer worded so "yes" accepts it. Package choices are also a row in `0001-stack.md`.
- Before adding a package, search npm and GitHub, then write the intake note from `docs/decisions/INTAKE-TEMPLATE.md`. Nothing is adopted from one blog post or because it is newer.
- Pin exact versions. Lessons from a task go to `docs/engineering/lessons.md`.

## Task brief

A task brief (issue, ticket or agent prompt) has these fields. A brief missing one is returned.

```
goal:            one sentence
owned paths:     folders the task may edit
design frame:    frame id, or n/a
records:         decision sections and ADRs it follows
behaviour change: none | <what changes and which record allows it>
acceptance:      tests by name, budget assertions, commands
not in scope:    what the task must not touch
prior-art:       search done (npm, GitHub, platform), verdict, licence; "none needed" for a refactor
perf:            budget row in docs/performance-contract.md, or "no new budget"
load:            light | heavy (heavy = Electron, Playwright or the real model; run one at a time)
report:          what changed, what passed, what was not verified
```

## Licences of code taken from elsewhere

| Licence                                      | Copy code                                                                                         | Use as dependency                                                                   | Ideas only                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| MIT, BSD, ISC, Apache-2.0                    | yes, with an "Adapted from <project> (<licence>): <path>" header and an entry in the notices file | yes                                                                                 | yes                            |
| MPL-2.0 (for example `@axe-core/playwright`) | no                                                                                                | dev dependency only                                                                 | yes                            |
| LGPL (LAME inside `wasm-media-encoders`)     | no                                                                                                | yes, as a separate unmodified file in `node_modules`, listed under Settings > About | yes                            |
| GPL, AGPL, unknown, no licence               | no                                                                                                | no                                                                                  | read and describe, write fresh |

Record every exception in `docs/decisions/0001-stack.md`.
