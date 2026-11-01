# Contributing

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), checked by `.githooks/commit-msg` (`git config core.hooksPath .githooks`).

```
feat(player): schedule the next sentence before the current one ends
fix(launcher): keep the pill open while the pointer is over the tooltip
test(extract): cover nested lists
```

Types: `feat fix docs style refactor perf test build ci chore revert`. Scope = feature name. One logical change per commit, tests included.

## Before pushing

```bash
pnpm run fmt              # format (vp fmt); CI runs fmt:check
pnpm exec vp check        # format, lint, types
pnpm exec vp test run     # unit + integration + component
pnpm run e2e              # Playwright fast set (fake engine)
pnpm run e2e:full         # includes the real Kokoro model
```

## Code

- New feature: `src/features/<name>/` with `index.ts`; other features import it only through `index.ts`.
- Shared request/response shapes live in `packages/protocol`; both sides import them.
- Colors, radii and motion come from `packages/ui` and `tokens.css` (Lumen). No hard-coded hex values in components.
- Name every screenshot after its design frame id.
