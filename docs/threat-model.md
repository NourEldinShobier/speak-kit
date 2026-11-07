# Threat model

Applies to: Speak Kit v0.3.0 (Windows), written 2026-11-01 from the source, `docs/architecture.md` and the decision records. Rule ids S1 and S18 in `docs/engineering/ostio-practices.md`. This is a design-level model: each threat names the defence in the code, its cost, and what is not verified. It is not a penetration test.

## Assets
- The user's text (pages, library documents, text you paste into the app).
- The user's clipboard: nothing reads it except the selection capture, which restores it (`docs/privacy.md`); renderer pages are denied `clipboard-read`.
- The user's voice clips used for cloning.
- The pairing token (ADR 0006).
- The integrity of the installed app and its updates.
- The user's machine: Speak Kit runs a loopback server, child processes and a Python environment.

## Trust boundaries
Web page to extension content script; extension to loopback server; Electron renderer to main process (IPC); main process to child processes (model host, Chatterbox sidecar, installer); app to the internet (`docs/privacy.md`); documents and web addresses the user imports (untrusted content).

## Threats and defences
| # | Threat | Defence | Cost | Not verified |
|---|---|---|---|---|
| T1 | Another web page calls the loopback server (CSRF, DNS rebinding) to make Speak Kit speak or read data | Bearer token on every route except `GET /v1/health`; requests with an `http(s)` Origin are rejected, only no Origin or `chrome-extension://` pass; `Host` header must be the loopback address and port; token compared with `timingSafeEqual`; optional `allowedExtensions` pins extension ids | One header check per request | A hostile-client e2e spec (wrong Origin, Host, token, oversize body) is planned in work package 13; server unit tests cover each check today |
| T2 | A malicious document or web address attacks the parser or the machine (zip bomb, path traversal in DOCX or EPUB, truncated PDF, huge HTML) | Local file size cap (`MAX_FILE_BYTES`), URL body cap of 8 MB, parsers run on text and never execute content; web address import refuses non-public addresses with a DNS-rebinding-safe lookup and at most 5 redirects | Rejects some legitimate large files | No zip entry-count or uncompressed-size cap before DOCX and EPUB parsing, no OCR pixel cap, and parsing runs on the Electron main thread (refactor plan G01, G47, G54; work packages 11 and 12) |
| T3 | Tampered update | `electron-updater` downloads from GitHub Releases and checks the SHA-512 in `latest.yml`; updates never install without the user's choice; `SPEAKKIT_UPDATE_URL` can redirect the feed, so a process that sets the app's environment can already run code as the user (same trust as T5); the updater runs only in packaged builds | None | The release is not code-signed (ADR 0007), so someone who controls the GitHub release controls the update |
| T4 | Compromised dependency | Lockfile-only installs (`pnpm install --frozen-lockfile`), install-script allowlist (`allowBuilds`), `packageManager` pin, every dependency named in a decision record | Slower upgrades | 24 of 40 direct dependencies still use `^` or `~` ranges and there is no release-age delay (refactor plan G18, work package 1) |
| T5 | A local process reads the token file and calls the server | Accepted risk (ADR 0006): the process already runs as the user; Origin and Host checks still apply to browser-driven attacks | None | File mode 0600 has no effect on Windows |
| T6 | A compromised renderer or injected script attacks the main process | Windows are created by one secure-window factory: sandbox on, context isolation on, no Node integration, new windows denied, navigation blocked; every IPC call is sender-checked and its arguments validated with valibot | None | Permission handlers deny every Chromium permission except audio capture for the main window's own `file:` page (`main/permissions.ts`, ADR 0017); the OS microphone block is the OS's; renderer loads from `file://` (ADR 0009); no Electron fuses yet (ADR 0004) |
| T7 | Child processes leak or abuse the environment, or run a planted executable | Child processes are started with `execFile`/`spawn` without a shell | None | Children inherit the full environment, and `nvidia-smi`, `python` and `uv` are found by bare name on `PATH` (refactor plan G55, G56; work package 5) |
| T8 | Deep link `speakkit://` used to trigger an action from a web page | `shared/deeplink.ts` validates input and allows a fixed set of actions | None | Not re-tested here |
| T9 | The extension is abused through the page it reads (page text is hostile) | The content script only reads text and sends it as data; sentences are plain strings sent to a local synthesizer; no page content is evaluated; the page DOM is not changed for highlighting (Custom Highlight API) | None | Content Security Policy of the extension pages was not re-reviewed for this document |
| T10 | Voice cloning misuse | A reference clip needs consent (`clip-rejected` when missing) and passes quality checks (`clip-rejected`); clips stay on the machine | One consent step | No check that the clip is the user's own voice |

## Out of scope
Attackers with administrator rights on the machine; physical access; side channels in the model; a malicious Chrome or Windows.

## Review
Revisit when a new network call, process type, IPC channel, or file format is added, and at each ADR review date (2026-12-27).
