# ADR 0013: Electron fuses set in the afterPack hook, RunAsNode exception kept

## Status
Accepted, 2026-11-02. Implements ADR 0004 (decision D3 of `docs/engineering/refactor-plan.md` section 5). Changes the mechanism named in ADR 0004 item 1 from the `electronFuses` option to the `afterPack` hook; the fuse values are unchanged.

Label: [S]. Exit test: remove the `RunAsNode` exception when `scripts/smoke-packaged.mjs` passes with `RunAsNode` off, after `packages/engine/src/kokoro.ts` starts the model host through an injected `spawnHost` that uses `utilityProcess.fork`. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
ADR 0004 asked for `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off and `EnableCookieEncryption` on, through `electron-builder.yml`. electron-builder 26.18 flips fuses after the `afterPack` hook and before signing. `scripts/after-pack.cjs` gives the macOS app an ad-hoc signature (Apple Silicon will not run unsigned code), and electron-builder skips its own signing because `identity` is null, so a flip after the hook would leave a signature that no longer matches the binary.

## Decision
1. `scripts/after-pack.cjs` flips the fuses with `@electron/fuses` before the macOS ad-hoc signing: `RunAsNode` on, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on. The `electronFuses` option stays unset.
2. `RunAsNode` stays on as a recorded exception. The model host and the engine worker start with `child_process.fork`, which runs the Electron binary as Node through `ELECTRON_RUN_AS_NODE`. A process that can set that variable already runs as the user (`docs/threat-model.md`).
3. `scripts/smoke-packaged.mjs` reads the fuse wire of the built binary with `getCurrentFuseWire` and fails unless the four values above hold, so turning `RunAsNode` off without the follow-up fails the smoke test.
4. Follow-up (separate package): a `spawnHost` function injected into `createKokoroEngine` so the desktop can use `utilityProcess.fork`; then `RunAsNode` goes off and a superseding ADR replaces item 2.

## Evidence
Measured on a Windows build of this repository (`node scripts/package.mjs --platform win --dir --version 0.0.0-dev`): the fuse wire of `win-unpacked/Speak Kit.exe` reads RunAsNode 49 (on), EnableNodeOptionsEnvironmentVariable 48 (off), EnableNodeCliInspectArguments 48 (off), EnableCookieEncryption 49 (on), and the app serves, speaks and quits cleanly with those values. Not tested: a macOS build (the hook order is reasoned from electron-builder's `platformPackager.js`); that `RunAsNode` off breaks `fork` (taken from Electron's fuse documentation).

## Alternatives considered
- `electronFuses` in `electron-builder.yml`: rejected, see Context.
- `resetAdHocDarwinSignature` with `electronFuses`: re-signs only the main binary, so the bundle seal made by the hook no longer matches; not tested, rejected.
- `RunAsNode` off now: rejected, the model host would not start.

## Consequences
- `NODE_OPTIONS` and `--inspect` no longer attach to the packaged app; debugging uses an unpackaged run.
- Cookie encryption is one-way; the app relies on no cookies.
- Guardrail (CI): `smoke-packaged.mjs` asserts the fuse values and the process count after start and after `--quit`.

## Licence
None. `@electron/fuses` is MIT and already installed through electron-builder.

## Decision-record amendment
`0004-electron-fuses-runasnode.md`, Decision item 1: "Through `electron-builder.yml` `electronFuses`" to "Through the `afterPack` hook (ADR 0013)". Item 4 is done by this ADR.

## Open questions for the user
None open.
