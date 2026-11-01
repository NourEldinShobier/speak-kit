# SpeakKit v0.2.0

Local text-to-speech: a Chrome extension, a Windows desktop app with a library and reader, and a local voice server (Kokoro; Chatterbox on a machine with a supported GPU and Python 3.10 to 3.12). Nothing leaves the computer except the one-time model download.

## Install on Windows

1. Run `SpeakKit-Setup-0.2.0.exe` (per-user install, Start menu entry, updates from GitHub Releases). The build is **not code-signed**: SmartScreen shows "unknown publisher" (More info, Run anyway). Or run `SpeakKit-0.2.0-portable.exe` from any folder (no updates).
2. First start: the setup wizard downloads the Kokoro voice model (about 180 MB).
3. Install the extension, either way:
   - From the app: Browser, Install the extension (opens the browser extensions page and the folder to pick).
   - By hand: Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> choose the `extension` folder here (or unzip `speakkit-extension-0.2.0.zip` and choose that folder).
4. Pair: in the app, Browser, copy the pairing token; in the extension, Options -> General -> Pairing token, paste it.
5. Select text on any page and click Listen, or press Ctrl+Shift+S. In the app: Ctrl+Alt+S reads the selection from any program, Ctrl+Alt+Space pauses.

Comet / Perplexity: `releases/open-in-comet.cmd` opens a separate Comet window with the extension loaded.

## From source

`start-speakkit.cmd` starts the app from a checkout (needs Node 24 and `pnpm install` in `code/`).

## Checksums (SHA-256)

```
b4e044245e3bae34fbd1a631245094bccee4ce1517891de444c74592be33a705  SpeakKit-Setup-0.2.0.exe
bf92046bcd5523f2e5612c8b521de87b4566f6965f0212efde5862167271d45a  SpeakKit-0.2.0-portable.exe
d0e4a5c47485d9f4977adf77bb6aafc54b4eafcd4d4ce1f636c5731a200976fa  speakkit-extension-0.2.0.zip
```

## What was checked for this build

- `pnpm run typecheck`, `lint` and `knip` clean; 598 unit tests passed (21 opt-in skipped); `pnpm e2e:full`: 140 passed plus 5 performance checks, real Kokoro and Electron included.
- `node scripts/smoke-packaged.mjs` and `--real` pass on `win-unpacked` of this build: health, 28 voices, one spoken sentence (1.8 s with the real model), bundled extension and worker, `--quit` exits 0, port freed.
- Not done: the NSIS installer was built but not run (silent install shows an options page); a real auto-update from a published release; Chatterbox on a GPU; listening to the voices; a real Windows toast, tray icon pixels and global key press. See `docs/testing.md` and `docs/scope.md`.

## Changes since v0.1.0

Library and reader in the app (TXT, MD, HTML, PDF, DOCX, EPUB, URLs, OCR for scanned PDFs after consent); global shortcuts, mini player and tray panel; export to WAV and MP3; Engines page with Chatterbox install and voice-cloning API; update flow; text normalization before synthesis; extension accessibility pass (axe clean), version-mismatch and PDF popup states; per-tab replace of speech streams. Hardening in this release: URL import refuses local and private addresses and caps the download, test-only environment switches are ignored by the packaged app, windows share one secure factory, optional extension-id pinning for the server.
