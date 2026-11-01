# SpeakKit

Text to speech that runs on your own computer. Select text in Chrome (or any Windows app), press a key, and a natural voice reads it. Nothing is uploaded: the voice model, Kokoro-82M, runs locally.

SpeakKit has three parts:

- **Chrome extension** (Manifest V3): reads selections and pages, highlights the sentence and word being read, has a floating player, a reader view and a side panel queue.
- **Desktop app** (Electron, Windows): runs the local voice server, lives in the tray, and adds what a browser cannot do: global shortcuts, a mini player, clipboard reading, audio export to MP3 or WAV, engine management and updates.
- **Local server** (`127.0.0.1` only, token protected): turns text into audio with Kokoro. A Chatterbox engine with voice cloning is optional where a GPU is available.

## Install

Download from the [latest release](https://github.com/NourEldinShobier/speakkit/releases/latest):

| File | What it is |
|---|---|
| `SpeakKit-Setup-<version>.exe` | Installer. Start menu entry, optional start at sign-in, updates through GitHub Releases. |
| `SpeakKit-<version>-portable.exe` | Runs from any folder, does not update itself. |
| `speakkit-extension-<version>.zip` | The extension, for Chrome, Edge or Brave. |

The builds are **not code-signed**, so Windows SmartScreen shows "unknown publisher" the first time. Choose "More info", then "Run anyway".

1. Start SpeakKit. The first run downloads the Kokoro model (about 180 MB) and walks through five setup steps.
2. Install the extension: in the app open **Browser** and press **Install from this app**. It opens `chrome://extensions` and shows the extension folder; turn on Developer mode, choose **Load unpacked**, pick that folder.
3. Pair: copy the token in the app and paste it in the extension under Options, General, Pairing token.

Global shortcuts (change them in Settings, Shortcuts):

| Keys | Action |
|---|---|
| Ctrl+Alt+S | Read the selected text in any app |
| Ctrl+Alt+Space | Play or pause |
| Ctrl+Alt+X | Stop |
| Ctrl+Alt+C | Read the clipboard |

## Develop

Needs Node 24 and pnpm 12. Everything lives in [`code/`](code); the toolchain is Vite+ (`vp`) and type-checking is tsrs.

```
cd code
pnpm install
pnpm run typecheck                           # tsrs on every project
pnpm run lint
pnpm --filter @speakkit/desktop exec vp build
pnpm run test                                # unit and integration tests (starts the built Electron app)
pnpm run e2e                                 # Chromium with the extension, fake engine
pnpm run e2e:full                            # adds the real Kokoro model and the desktop flows
```

Run the app from source: `pnpm --filter @speakkit/desktop exec vp build`, then `pnpm --filter @speakkit/desktop start`. Build the installer with `pnpm --filter @speakkit/desktop exec node scripts/package.mjs` (output in `code/apps/desktop/release`), then check it with `node scripts/smoke-packaged.mjs` in the same folder.

Continuous integration (`.github/workflows/ci.yml`) runs the same commands on Windows. Pushing a tag such as `v0.2.0` runs `release.yml`, which builds the installer, the portable exe and the extension zip and attaches them to a GitHub release.

## How it fits together

| Path | What |
|---|---|
| `code/packages/protocol` | API types, audio frame codec, extension messages |
| `code/packages/engine` | `TtsEngine`, Kokoro in a child process, idle unload |
| `code/packages/server` | Loopback HTTP server and CLI |
| `code/packages/ui` | The Lumen component kit shared by the extension and the app |
| `code/apps/extension` | Chrome extension |
| `code/apps/desktop` | Electron app |
| `code/e2e` | Playwright suites |

Start with [`docs/architecture.md`](docs/architecture.md) (contract, runtime, resource lifecycle), then [`docs/testing.md`](docs/testing.md), [`docs/perf.md`](docs/perf.md) and the stack decisions in [`docs/decisions/0001-stack.md`](docs/decisions/0001-stack.md).

## Screenshots

Every built screen is captured in dark and light and compared with its design frame. Open [`designs/built/review.html`](designs/built/review.html) to browse them, and [`docs/visual-fidelity.md`](docs/visual-fidelity.md) for the verdict on each. The designs themselves are in [`designs/next/screens`](designs/next/screens) (frame ids such as `A1`, `H5`, `W3`).

## Privacy

The server listens on `127.0.0.1` only and rejects requests from web pages. Text is synthesized on your computer; the only network traffic is the one-time model download and the update check against GitHub Releases (which you can turn off in Settings, About).

## License

[MIT](LICENSE). Third-party licenses are listed in the app under Settings, About. The MP3 encoder is LAME (LGPL) compiled to WebAssembly, loaded as a separate module.
