# Working in this repo

Each rule ends with its enforcer and origin: `(enforced by: X; origin: Y)`. A rule that has no tool says `review`. This file holds only what is non-standard for the repo; delete or tool a line before adding one (size check: at most 25 rules).

## Order of truth

1. The user's instruction in the current chat.
2. Accepted ADRs in `docs/decisions/` and `docs/decisions/0001-stack.md`.
3. This file, then `docs/architecture.md`, `docs/glossary.md`, `docs/performance-contract.md`.
4. Existing code. When code and a record disagree, change one in the same commit and say which.

## Ask the user only for

A change to a decided item (an ADR); a new or replaced shipped dependency, language, framework or process type; loosening a budget, lint limit, ratchet baseline or screenshot baseline; a change to the wire protocol or its version; anything that sends data off the machine; money, accounts, legal text, signing; destroying unmerged work or user data; design gaps. Ask as one numbered list with a recommended answer worded so "yes" accepts it. Everything else: decide inside the records, pass the gates, report.

## Rules

1. Toolchain is Vite+ (`pnpm exec vp ...`) on Node 24 and pnpm 12; type-check with `pnpm typecheck` (tsrs); fall back to `tsc` if tsrs fails and say so. (enforced by: CI; origin: ADR 0012)
2. Search npm and GitHub before building anything a package could do; compare licence, size, maintenance, speed; record each new package in `docs/decisions/0001-stack.md`. (enforced by: `check-deps.mjs`; origin: 0001-stack)
3. Every direct dependency is pinned to an exact version and named in a decision record. (enforced by: `check-deps.mjs`; origin: ostio P14, P15)
4. Features live in `src/features/<name>/`; import another feature only through its `index.ts`. (enforced by: lint boundary rule; origin: ostio P10)
5. Wire contracts live in `packages/protocol`; changing them needs the user's yes and an ADR. (enforced by: review; origin: ostio P4)
6. UI comes from `packages/ui` (Lumen) and `tokens.css`; no hard-coded hex values; use logical CSS properties (`inline-start`, not `left`). (enforced by: `tokens.test.ts`, `check-css.mjs`; origin: ostio L10)
7. The UI is English-only; write complete sentences, use `plural()` and `Intl` for counts, dates and sorting. (enforced by: review; origin: ADR 0002)
8. Visible name is "Speak Kit"; code, packages, ids and env vars are `speakkit`. (enforced by: review; origin: ostio N6)
9. Use the terms in `docs/glossary.md`; one code term per concept. (enforced by: review; origin: ostio N2)
10. UI state with more than two flags is a discriminated union and a pure `reduce(state, action)` with an exhaustive `never` check. (enforced by: review; origin: ostio U1)
11. Limits: functions 50 lines, complexity 15, depth 4, 3 parameters, files 300 lines, no nested ternary, no `as any` without a one-line reason. (enforced by: lint and ratchet; origin: ostio C2 to C7)
12. Every `catch` handles the error in a typed way or carries a one-line reason for ignoring it; errors cross processes as `ErrorCode` and arguments, not English text. (enforced by: ratchet; origin: ostio R1 to R9, `docs/architecture.md` Error model)
13. No synchronous file calls after startup in runtime code; no work on the Electron main thread that can take more than a few milliseconds. (enforced by: lint `node/no-sync`; origin: ostio F8)
14. Every new process, window, timer, worker or network host needs a row in `docs/architecture.md` (process table) or `docs/privacy.md` and a test. (enforced by: check scripts; origin: ostio A11, S14)
15. Every feature with a budget has a row in `docs/performance-contract.md` and a test; never raise a budget without an ADR. (enforced by: `check-integrity.mjs`; origin: ostio F1)
16. Every change ships with tests; a bug fix starts with a failing test; tests use literal expected values through the public interface. (enforced by: review; origin: ostio T1, T2)
17. Do not skip, loosen or delete a test, budget or baseline to get green; report what cannot pass. (enforced by: `check-integrity.mjs`; origin: ostio T22)
18. UI changes update the screenshots named after the design frame id (`<ID>-<what>-<theme>.png`); designs: `designs/review.html`, source `designs/speakkit.figcraft`, generator `designs/gen`. (enforced by: visual harness; origin: ostio A10, D18)
19. Conventional Commits, one logical change per commit, optional trailers `Design: <frame id>` and `ADR: <number or n/a>`. (enforced by: `.githooks/commit-msg`; origin: ostio D20)
20. Generated files (`tokens.ts`, `icon-data.ts`, `logo-data.ts`, `docs/MODULES.md`, `docs/LAYERS.md`) are never edited by hand; regenerate them. (enforced by: staleness tests, `gen-docs.mjs --check`; origin: ostio P4, D14)
21. Test-only code is compiled out of shipped builds. (enforced by: `tests/bundle.test.ts`; origin: ostio C22)
22. Local secrets are never logged or put in URLs; the pairing token appears only in the data directory file, the extension storage and the Authorization header. (enforced by: review; origin: ADR 0006)
23. No TODO or FIXME in source; record follow-ups in the report or an ADR. (enforced by: review; origin: ostio C15)
24. Work only in your own worktree and branch; commit small, push to `main` in batches of about ten commits (each push costs a CI run), fast-forward only; never force-push or rewrite `main`. (enforced by: review; origin: ostio G4)
25. End each task with a report: what changed, what passed, what was not verified. (enforced by: review; origin: ostio D19)
