# Contributing to Speak Kit

Thanks for helping. Bug reports, fixes, docs and focused features are all welcome. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, see [SECURITY.md](SECURITY.md).

For anything larger than a fix, open an issue first so the direction is agreed before you write code.

## Setup

You need Node 24, pnpm 12 and Git. On Windows the desktop app builds and runs; the extension and server work anywhere Node runs.

```
git clone https://github.com/NourEldinShobier/speak-kit.git
cd speak-kit/code
pnpm install --frozen-lockfile
git config core.hooksPath .githooks      # checks commit messages
```

The toolchain is Vite+ (`pnpm exec vp ...`) and the type-checker is tsrs (`pnpm typecheck`). More house rules: [`code/CLAUDE.md`](code/CLAUDE.md) and [`code/CONTRIBUTING.md`](code/CONTRIBUTING.md).

## Run it locally

Desktop app (runs the loopback server):

```
pnpm --filter @speakkit/desktop exec vp build
pnpm --filter @speakkit/desktop start
```

Extension in Chrome, Edge or Brave:

```
pnpm --filter @speakkit/extension exec vp build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick `code/apps/extension/dist`. In the desktop app copy the pairing token and paste it in the extension under Options, General, Pairing token. After a rebuild press the reload icon on the extension card.

## Test only what you changed

The full suite is slow and uses fixed ports; CI runs it on every pull request. Locally run the tests that cover your change:

| Area | Command (from `code/`) |
|---|---|
| One spec | `pnpm exec vp test run path/to/file.test.ts` |
| A package | `cd packages/server && pnpm exec vp test run` (same for `engine`, `player`, `protocol`, `ui`) |
| Desktop app | `cd apps/desktop && pnpm exec vp test run` |
| Extension | `cd apps/extension && pnpm exec vp test run` |
| Types | `pnpm typecheck` (or `pnpm exec tsrs --noEmit -p <dir>` for one project) |
| Lint and format | `pnpm exec vp lint <files>` and `pnpm exec vp fmt <files>` |
| End to end | `pnpm e2e tests/popup.spec.ts` runs one Playwright spec with the fake engine; `pnpm e2e:full` loads the real Kokoro model |

Tests that load the real Kokoro or Chatterbox model are skipped unless the model folder exists (`SPEAKKIT_MODELS_DIR`, `SPEAKKIT_CHATTERBOX_DIR`).

A bug fix starts with a failing test. Do not loosen a test, lint limit or screenshot baseline to get green; explain in the pull request why it has to change.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat(player): ...`, `fix(server): ...`, `docs: ...`. Types: `feat fix docs style refactor perf test build ci chore revert`. The scope is the feature or package. One logical change per commit, tests included.
- Keep a pull request to one topic. Fill in the template and link the issue.
- The visible product name is "Speak Kit"; technical names (`speakkit`, `@speakkit/*`) stay as they are.
- Do not add a dependency a maintained package or the platform already covers. If you add one, record why in [`docs/decisions/0001-stack.md`](docs/decisions/0001-stack.md) and regenerate [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) with `node tools/third-party-notices.mjs`.
- UI changes reuse `packages/ui` (Lumen components and `tokens.css`); no hard-coded colours. Screenshots are named after the design frame id (`<ID>-<what>-<theme>.png`).

## Licence

Contributions are released under the [Apache License 2.0](LICENSE), including its patent grant (section 3).
