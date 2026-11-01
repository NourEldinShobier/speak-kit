# SpeakKit v0.1.0

1. Start the app: double-click `start-speakkit.cmd` (first run downloads the Kokoro voice model, about 180 MB).
2. Install the extension: Chrome -> `chrome://extensions` -> turn on Developer mode -> Load unpacked -> choose the `extension` folder here.
3. Pair: in the app, copy the pairing token; in the extension, open Options > General > Pairing token and paste it.
4. Select text on any page and click Listen, or press Ctrl+Shift+S.

## Installer and portable build

The Windows installer, the portable exe and the update metadata are built by `node scripts/package.mjs` in `code/apps/desktop` and land in `code/apps/desktop/release` (not committed: about 190 MB each). CI builds them on a version tag (`.github/workflows/release.yml`) and attaches them to the GitHub release together with the extension zip.

- `SpeakKit-Setup-<version>.exe`: per-user install, Start menu entry, `speakkit://` link, updates from GitHub Releases. Not code-signed: Windows SmartScreen shows "unknown publisher" (More info, Run anyway).
- `SpeakKit-<version>-portable.exe`: runs from any folder, does not update itself.
- The extension is also inside the app (`resources/extension`): Browser, Install from this app opens the browser extensions page and the folder to choose with Load unpacked.
- `SpeakKit.exe --quit` asks a running copy to exit.
