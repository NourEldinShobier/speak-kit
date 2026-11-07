# Contributing to Speak Kit

Bug reports, fixes and focused features are welcome. For anything larger than a fix, open an issue first so the direction is agreed before you write code.

## Setup

You need Node 24, pnpm 12 and Git. On Windows the desktop app builds and runs; the extension and server work anywhere Node runs.

```
git clone https://github.com/NourEldinShobier/speak-kit.git
cd speak-kit/code
pnpm install --frozen-lockfile
```

The toolchain is Vite+ (`pnpm exec vp ...`) and the type-checker is tsrs (`pnpm typecheck`).

## Run it locally

Desktop app (it runs the loopback server):

```
pnpm --filter @speakkit/desktop exec vp build
pnpm --filter @speakkit/desktop start
```

Extension in Chrome, Edge or Brave:

```
pnpm --filter @speakkit/extension exec vp build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick `code/apps/extension/dist`. In the desktop app copy the pairing token and paste it in the extension under Options, General, Pairing.

## Test what you changed

The full suite is slow and uses fixed ports; CI runs it on every pull request. Locally run the tests that cover your change:

| Area | Command (from `code/`) |
|---|---|
| One spec | `pnpm exec vp test run path/to/file.test.ts` |
| A package | `cd packages/server && pnpm exec vp test run` (same for `engine`, `player`, `protocol`, `ui`) |
| Desktop app | `cd apps/desktop && pnpm exec vp test run` |
| Extension | `cd apps/extension && pnpm exec vp test run` |
| Types | `pnpm typecheck` |
| Lint and format | `pnpm exec vp lint <files>` and `pnpm exec vp fmt <files>` |

A bug fix starts with a failing test. Do not loosen a test or lint limit to get green; explain in the pull request why it has to change.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(player): ...`, `fix(server): ...`, `docs: ...`.
- Keep a pull request to one topic and link the issue.
- The visible product name is "Speak Kit"; technical names (`speakkit`, `@speakkit/*`) stay as they are.
- Do not add a dependency that a maintained package or the platform already covers.

## License

Contributions are released under the Apache License 2.0 (see `LICENSE`).
