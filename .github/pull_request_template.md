## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Checks

- [ ] Ran the tests that cover the files I changed (not the whole suite)
- [ ] `pnpm typecheck` passes for the projects I touched
- [ ] `pnpm exec vp lint` and `pnpm exec vp fmt` are clean on the changed files
- [ ] Behaviour change has a test; a bug fix started with a failing test
- [ ] UI change: screenshots updated (named `<frame id>-<what>-<theme>.png`)
- [ ] New dependency recorded in `docs/decisions/0001-stack.md` and `THIRD_PARTY_NOTICES.md` regenerated
- [ ] Commits follow Conventional Commits
