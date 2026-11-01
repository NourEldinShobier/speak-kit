# CI

`.github/workflows/ci.yml` runs on pushes to `main`, tags `v*`, pull requests, a nightly schedule (02:47 UTC) and manual dispatch. `nightly.yml` adds the `tsc` drift check and `pnpm audit`; `release.yml` builds releases.

## How the pipeline decides what to run

The `changes` job (dorny/paths-filter) sorts the changed files into areas:

| Area | Paths (under the repo root) |
|---|---|
| `ext` | `code/apps/extension/**` |
| `desktop` | `code/apps/desktop/**` |
| `e2e` | `code/e2e/**` |
| `shared` | `code/packages/**`, `code/scripts/**`, `code/tools/**`, `code/.ratchet/**` |
| `config` | lockfile, `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `knip.json`, `tsconfig*.json`, `ci.yml` |
| `docs` | `docs/**`, `**/*.md` |

A `plan` step turns them into run flags. **Everything runs** (`full`) on a tag, on the nightly schedule, on a manual run, and when `config` changed. Otherwise:

| Job | Runner | Runs when | What it does |
|---|---|---|---|
| `static` | ubuntu | always | `typecheck` (tsrs), `lint`, `fmt:check`, `knip`, `gen-docs.mjs --check`, `pnpm run gates` (deps, CSS, network, integrity, ratchet) |
| `unit` | ubuntu | `ext`, `shared`, `e2e` or full | `vp test run --exclude "apps/desktop/**" --changed <base>` |
| `e2e-extension` | ubuntu, 2 shards | `ext`, `shared`, `e2e` or full | Playwright specs in `code/e2e/tests` with the fake engine, no perf phase |
| `desktop` | windows | `desktop`, `shared` or full | builds desktop and extension, runs the desktop package's tests (Electron) |
| `ci-ok` | ubuntu | always | fails when any needed job failed or was cancelled; skipped jobs pass |

A docs-only change runs `changes`, `static` and `ci-ok`. Jobs are gated by job-level `if:`, never by `paths:` on the workflow, so `ci-ok` always reports. **`ci-ok` is the only job to mark as a required check.**

### Unit selection

`<base>` is the previous tip of the branch (`github.event.before`) on a push and the base branch commit on a pull request. The `--changed` flag makes vitest run the tests whose import graph touches a changed file. The job falls back to a full run when the base is empty, all zeros or not in the fetched history, and whenever the run is full. The desktop app's tests are not selected by import graph (they start the built app), so the whole desktop package runs whenever `desktop` or `shared` changed.

Pushes to `main` are never cancelled by a newer push: the next push's `--changed` base is the previous tip, so a cancelled run would leave its commits untested. Pull requests cancel their own superseded runs.

## Reproduce the selection locally

From `code/`:

```
pnpm exec vp test run --exclude "apps/desktop/**" --changed origin/main      # unit, as on a pull request
pnpm exec vp test run --exclude "apps/desktop/**"                             # full unit run
pnpm --filter @speakkit/desktop exec vp test run                              # desktop (needs the builds below)
E2E_SKIP_PERF=1 E2E_WORKERS=1 node e2e/run.mjs --shard=1/2                    # one e2e shard
pnpm run typecheck && pnpm run lint && pnpm run fmt:check && pnpm run knip && node scripts/gen-docs.mjs --check && pnpm run gates
```

`check-integrity.mjs` compares ratchet baselines with `origin/main`, so run `git fetch origin` first. The desktop tests need `vp build` in `apps/desktop` and in `apps/extension`.

## When everything runs

Tags `v*`, the nightly schedule, a manual dispatch, and any change to the lockfile, `ci.yml`, or a shared root config (`package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `knip.json`, `tsconfig*.json`). The perf phase of the e2e suite (absolute timing budgets) never runs on hosted runners; run `pnpm run e2e` on a quiet machine before a release.

## Cost

The runner has 2 vCPUs. Windows minutes cost double and macOS ten times on a private repository, so only the `desktop` job (Electron) uses Windows; everything else is ubuntu. pnpm's store is cached through `setup-node`, the Playwright browser through `actions/cache` keyed by the lockfile.

### Fonts on the runner

The extension pages ask for Inter first and bundle no web font, so layout checks depend on the installed fonts. The e2e job installs `fonts-inter` (apt) so the 320 px reflow checks measure the intended font and not the runner's wider fallback.

## Add a spec group

- Extension e2e: add `code/e2e/tests/<name>.spec.ts`. Shards are balanced by Playwright over the spec files; nothing else to register. To split further, add values to `matrix.shard` in `ci.yml` (`3/3`) and extend the list.
- Desktop: add `code/apps/desktop/tests/<name>.test.ts`; the `desktop` job runs the whole package.
- A new area (for example a new app): add a filter in `changes`, a flag in `plan`, a job with a job-level `if:`, add the job to `ci-ok.needs`, and describe it here.
- A test that cannot run on a hosted runner (global hotkeys, a real model) is gated behind an explicit environment variable with `skipIf`, and listed below.

### Tests gated off the hosted runner

| Test | Gate | Reason |
|---|---|---|
| `packages/engine/tests/real.test.ts` | `SPEAKKIT_REAL=1` | downloads the Kokoro model |
| `packages/engine/tests/real-chatterbox.test.ts` | `SPEAKKIT_REAL_CHATTERBOX=1` | NVIDIA GPU and Python |
| `e2e/tests/full.spec.ts`, `desktop.spec.ts` | `@slow` tag, `pnpm run e2e:full` | real model, Electron |
| `e2e/tests/perf.spec.ts` | `E2E_SKIP_PERF=1` on CI | absolute timing budgets |
