# Releasing Speak Kit

A release is a git tag. Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`, which builds Windows and macOS, smoke-tests the packaged apps and attaches everything to a GitHub release with generated notes.

## Cut a release

1. Make sure `main` is green (CI) and `code/apps/desktop/package.json` has the version you are about to tag. The tag decides the version of the installers; `package.json` only matters for local builds.
2. Optional: try the pipeline first. Actions > Release > Run workflow, branch `main`, leave "dry run" on. It builds the same files and keeps them as workflow artifacts (`release-win`, `release-mac`) for 14 days, without creating a release. Use the "platforms" input to build only Windows or only macOS (macOS minutes cost ten times as much as Linux minutes). From a terminal: `gh workflow run release.yml --ref main -f dry_run=true -f platforms=windows`.
3. Tag and push: `git tag v0.4.0 && git push origin v0.4.0`.
4. Watch the run. The `Windows` and `macOS` jobs package and smoke-test in parallel; the `publish` job then creates the release with generated notes and uploads the files. If one job fails nothing is published; fix, delete the tag (`git push origin :refs/tags/v0.4.0`), and tag again.

The Windows app updates itself from these releases: electron-updater reads `latest.yml` from the latest release. `latest-mac.yml` is attached for the macOS updater too, but Squirrel.Mac (what electron-updater uses on macOS) only installs updates for a properly signed app, so until the app is signed with a Developer ID (last section) Mac users update by downloading the new dmg.

## Artifacts

| File | What it is |
| --- | --- |
| `Speak-Kit-Setup-<version>.exe` (+ `.blockmap`) | Windows installer (NSIS, per user). The blockmap lets the updater download only what changed. |
| `Speak-Kit-<version>-portable.exe` | Windows portable exe; it unpacks itself at every start and does not auto-update. |
| `latest.yml` | Windows update metadata for electron-updater. |
| `Speak-Kit-<version>-mac-arm64.dmg` / `-mac-x64.dmg` | macOS disk image for Apple Silicon / Intel. This is the file to download by hand. |
| `Speak-Kit-<version>-mac-arm64.zip` / `-mac-x64.zip` (+ `.blockmap`) | The same app zipped. macOS auto-update (once the app is signed) downloads the zip, not the dmg, so it must stay attached. |
| `latest-mac.yml` | macOS update metadata; lists both zips and the updater picks the one for its architecture. |
| `speakkit-extension-<version>.zip` | The Chrome extension, unpacked, for "Load unpacked" or the Chrome Web Store upload. |

Local builds: `pnpm --filter @speakkit/desktop exec node scripts/package.mjs [--platform win|mac] [--version X.Y.Z] [--dir]` writes to `code/apps/desktop/release/`. `--platform mac` only works on a Mac (the dmg needs `hdiutil`, the signature needs `codesign`). `--dir` skips the installers and leaves the unpacked app for `scripts/smoke-packaged.mjs`.

What the smoke test checks, on both platforms: the app starts hidden, `/v1/health` answers, voices list with the token, one sentence is spoken with the fake engine, the extension and engine worker are bundled, a second launch hands over and adds no processes, `--quit` exits cleanly, the port is freed, no process is left. On macOS it starts the arm64 app (the runner is arm64); the x64 app is built from the same files but is not started in CI.

## First launch of the unsigned Mac app

The macOS build is not signed with an Apple Developer ID and not notarized. It carries an ad-hoc signature (`scripts/after-pack.cjs`), which Apple Silicon needs to run it at all, but Gatekeeper still treats a downloaded copy as coming from an unidentified developer. Tell users:

1. Open the dmg and drag Speak Kit to Applications.
2. Do not double-click it the first time. Right-click (or Control-click) Speak Kit in Applications, choose Open, then Open again in the dialog. On macOS 15 and later that dialog may only offer Cancel: close it, open System Settings > Privacy & Security, scroll to the message about Speak Kit and click "Open Anyway".
3. If macOS says the app "is damaged and can't be opened", the quarantine flag is the cause. In Terminal: `xattr -dr com.apple.quarantine "/Applications/Speak Kit.app"`, then open it again.

Each new download of a dmg repeats these steps until the app is signed and notarized.

Reading selected text with the global shortcut presses Cmd+C through System Events. macOS asks once for permission to control System Events, and the app must be listed under System Settings > Privacy & Security > Accessibility.

## Adding Apple signing and notarization later

Needs an Apple Developer Program membership (99 USD a year). Then:

1. In the developer account create a "Developer ID Application" certificate, export it with its private key as a `.p12`, and base64-encode it.
2. Create an app-specific password for the Apple ID (appleid.apple.com), and note the Team ID.
3. Add repository secrets: `CSC_LINK` (the base64 `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
4. Pass them to the Package step of the macOS job as environment variables.
5. In `code/apps/desktop/electron-builder.yml` under `mac:` remove `identity: null`, set `hardenedRuntime: true`, add `entitlements` and `entitlementsInherit` plists (allow-jit, allow-unsigned-executable-memory and disable-library-validation, which Electron and the native onnxruntime library need) and `notarize: true`. Drop the ad-hoc signing from `scripts/after-pack.cjs` (keep the removal of the other architecture's binaries); electron-builder signs every native file in the app itself.
6. In `scripts/package.mjs` remove `CSC_IDENTITY_AUTO_DISCOVERY: "false"` for the macOS build.
7. Notarization takes a few minutes per architecture. Verify the result on a Mac that never saw the app: `spctl --assess --type execute -vv "Speak Kit.app"` and `xcrun stapler validate "Speak Kit.app"`.

Windows is the same story with a code-signing certificate (`CSC_LINK` and `CSC_KEY_PASSWORD`, or Azure Trusted Signing); until then SmartScreen shows "unknown publisher".
