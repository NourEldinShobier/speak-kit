# SpeakKit v0.3.0

Local text-to-speech: a Chrome extension, a Windows desktop app with a library and reader, and a local voice server (Kokoro; Chatterbox on a machine with a supported GPU and Python 3.10 to 3.12). Nothing leaves the computer except the one-time model download.

## Install on Windows

1. Run `SpeakKit-Setup-0.3.0.exe` (per-user install, Start menu entry, updates from GitHub Releases). The build is **not code-signed**: SmartScreen shows "unknown publisher" (More info, Run anyway). Or run `SpeakKit-0.3.0-portable.exe` from any folder (no updates).
2. First start: the setup wizard downloads the Kokoro voice model (about 180 MB).
3. Install the extension, either way:
   - From the app: Browser, Install the extension (opens the browser extensions page and the folder to pick).
   - By hand: Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> choose the `extension` folder here (or unzip `speakkit-extension-0.3.0.zip` and choose that folder).
4. Pair: in the app, Browser, copy the pairing token; in the extension, Options -> General -> Pairing token, paste it.
5. Select text on any page and click Listen, or press Ctrl+Shift+S. In the app: Ctrl+Alt+S reads the selection from any program, Ctrl+Alt+Space pauses.

Comet / Perplexity: `releases/open-in-comet.cmd` opens a separate Comet window with the extension loaded.

## From source

`start-speakkit.cmd` starts the app from a checkout (needs Node 24 and `pnpm install` in `code/`).

## Checksums (SHA-256)

```
de993d0127425e7e7d958abd8782a264943cafd5a535f180a88dbbab8e966a8c  SpeakKit-Setup-0.3.0.exe
41f3ef88149c7633f24b2d404d215b8ebedc9401a7c95682cd09b1d409c9bedb  SpeakKit-0.3.0-portable.exe
bab39803ceeb85c31e6099d26313bd145a3d1a856c8a2461e72e581ad40071b4  speakkit-extension-0.3.0.zip
```

## What was checked for this build

- `pnpm run typecheck` (8 of 8), `lint`, `fmt:check` and `knip` clean; 792 unit tests passed (4 opt-in skipped); `pnpm e2e:full`: 149 passed plus 6 performance checks, real Kokoro and Electron included. Cold start (model unloaded, click Listen to first audio) 1.5 s; warm 0.43 s.
- `node apps/desktop/scripts/smoke-installer.mjs`: silent install of `SpeakKit-Setup-0.3.0.exe` into a temp folder, health and one spoken sentence (fake engine), bundled extension and worker, a second launch exits without adding processes, `--quit` exits 0 and frees the port, silent uninstall removes the folder. `smoke-packaged.mjs` passes on the portable exe.
- Not done: install on a second machine or clean profile; a real auto-update from a published release; Chatterbox through the installed app; listening to the voices; a real Windows toast, tray icon pixels and global key press. The build is unsigned. See `docs/testing.md` and `docs/scope.md`.

## Changes since v0.2.0

Faster cold start (graph optimization off for the CPU session, warming on keyboard commands, tray click and pointer approach; popup shows "Waking up" at once); Chatterbox install through uv with a rewritten sidecar (abort, reference reuse, warm-up); desktop library and reader gain bookmarks, a voice panel and Export audio from the reader; URL import resolves names once and connects to the checked address; test-only code is stripped from the shipped bundle; per-site default permission, "Not assigned" shortcut badge and an "Engine asleep" dock in the extension; paragraph button reachable by keyboard; one sentence splitter shared by extension and desktop; design tokens generated from one stylesheet; repo-wide formatting and LF line endings.
