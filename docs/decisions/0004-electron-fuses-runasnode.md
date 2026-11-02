# ADR 0004: Electron fuses, with RunAsNode kept on

## Status
Accepted, 2026-11-01. Decision D3 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [S]. Exit test: the `RunAsNode` fuse may be turned off when `packages/engine/src/kokoro.ts` starts the model host through an injected `spawnHost` that uses `utilityProcess.fork`, and `scripts/smoke-packaged.mjs` passes with the fuse off. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G52 (S4): the packaged app has no Electron fuses set. `apps/desktop/electron-builder.yml` has `asar: false` because the engine worker is its own Node process and loads `kokoro-js`, `onnxruntime-node` and `koffi` from disk, so the two asar-related fuses do not apply. `packages/engine/src/kokoro.ts` (around line 70) starts the model host with `child_process.fork`, which inside Electron runs the Electron binary as Node and needs the `RunAsNode` fuse on (Electron fuse documentation; not tested here).

## Decision
1. Through the `afterPack` hook (ADR 0013), set `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off and `EnableCookieEncryption` on.
2. Leave `RunAsNode` on. This is a recorded exception, not an oversight. A process that can set `ELECTRON_RUN_AS_NODE` already runs as the user, so the fuse adds little against the local-process attacker in `docs/threat-model.md`.
3. Follow-up (separate package): pass a `spawnHost` function into `createKokoroEngine` so the desktop can use `utilityProcess.fork`, then turn `RunAsNode` off and replace this exception with a superseding ADR.
4. Work package 11 owns the `electron-builder.yml` change and a check in `scripts/smoke-packaged.mjs` that reads the fuse state of the built binary.

## Evidence
- Repository: `apps/desktop/electron-builder.yml` (`asar: false`), `packages/engine/src/kokoro.ts:70` (`fork`), refactor plan G52.
- Not tested: that turning `RunAsNode` off breaks `fork` in the pinned Electron version (taken from Electron's fuse documentation); that cookie encryption changes nothing for the app (the app stores no cookies it relies on; unverified). The packaged smoke test would prove both.

## Alternatives considered
- Turn `RunAsNode` off now: rejected. The model host would fail to start in the packaged app.
- Leave all fuses at their defaults: rejected. The two flagged fuses remove environment-variable and command-line routes to a debugger at no cost.
- Enable asar integrity fuses: not applicable with `asar: false`.

## Consequences
- Behaviour: `NODE_OPTIONS` and `--inspect` no longer attach to the packaged app. Developers use an unpackaged build for debugging.
- Guardrail (CI): `smoke-packaged.mjs` asserts the three fuse values on the built binary and that `RunAsNode` is on until the superseding ADR exists.

## Licence
None. Uses `@electron/fuses` through electron-builder, already a dependency of the builder.

## Decision-record amendment
`0001-stack.md`, section "System integration and packaging", row "electron-builder 26.18": append `Fuses: see ADR 0004.` once WP-11 lands.

## Open questions for the user
None open.
