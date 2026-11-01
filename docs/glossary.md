# Glossary

One code term per concept. Use the code term in identifiers, tests and commit messages; use the user-facing term in UI strings. A rename happens only when two code terms clash for the same concept (see "Clashes to resolve"). Applies to: v0.3.0, written 2026-11-01. Rule ids refer to `docs/engineering/ostio-practices.md` (N2, N5, D15).

| Concept | Code term | User-facing term | Notes |
|---|---|---|---|
| The product | `speakkit` | Speak Kit | Technical names (packages, ids, headers, env vars) stay `speakkit` / `SPEAKKIT_*`. |
| Text turned into audio, from start to finish | `speak` (route `/v1/speak`, `SpeakRequest`) | Listen, Read aloud | One request carries a list of sentences and returns a stream of audio frames. |
| One unit sent to the engine and highlighted | `sentence` | (not shown) | Made by `splitSentences` in `packages/player/src/sentences.ts` (`Intl.Segmenter`). One sentence is one audio frame. |
| A paragraph-level unit of a page or library document | `block` | paragraph | Extension: `features/reader/types.ts` `Block`. Desktop: `shared/library/contract.ts` `Block`. Not the same type, same idea. |
| Text imported into the desktop library | `document` / `DocMeta` (metadata), body stored per document | document | Do not write `doc` in new code or `item` for a document. `Format` is the file kind, `Source` is where it came from (file, web address, clipboard). |
| An entry waiting to be read, in the player or popup queue | `QueueItem` | queue item (UI: "Up next") | Two types exist today: `apps/extension/src/shared/client.ts` and `packages/player/src/types.ts`. See "Clashes to resolve". |
| Reading session for one document in the desktop reader | `reader` (`ReaderController`) | Reader | "Reading" is the activity; `reader` is the feature and the main-process controller. |
| Text-to-speech backend | `engine` (`EngineId`, `TtsEngine`) | engine (Kokoro, Chatterbox) | Kokoro runs in a child process (the model host); Chatterbox runs as a Python sidecar. `EngineState` is the lifecycle: missing, downloading, installing, unavailable, unloaded, loading, ready, error. |
| A speaker identity of an engine | `voice` (`Voice`, `DEFAULT_VOICE`) | voice | `cloned: true` marks a voice made from a reference clip. |
| A voice made from a reference recording | `clone` / `ClonedVoice` (route `/v1/voices/clone`) | cloned voice | The recording is the reference clip; the quality checks are `clip-rejected`. |
| Load the model ahead of the first request | `warm` (`POST /v1/engine/warm`) | (not shown) | Idempotent, returns 202. |
| Keep a ready model loaded for at least N ms more | `hold` (`HoldRequest`, `POST /v1/engine/hold`) | (not shown) | The extension sends 600000 on pause and 0 on resume. |
| Free the model from memory after inactivity | `idle unload` (`idleUnloadAtMs`) | "Unload when idle" setting | Leaves the engine in `unloaded`, not an error. |
| Cancel earlier streams with the same group value | `replace group` (header `X-SpeakKit-Replace`) | (not shown) | Value is `tab-<tabId>`; the desktop reader uses `tab-0`. The legacy value `1` cancels every earlier stream of the token. |
| Frames of audio on the wire | `frame` (`frames.ts`, content type `application/vnd.speakkit.frames`) | (not shown) | Binary; one audio frame per sentence plus control and error frames. |
| Secret that authorizes calls to the loopback server | `token` (file `<dataDir>/token`, header `Authorization: Bearer`) | pairing token, "connection key" is not used | Created by the app; the extension stores a copy after pairing. See ADR 0006. |
| Linking the extension to the app | `pairing` (`main/pairing.ts`) | Connect, Test connection | "Pair" in code and docs; "Connect" in the UI. |
| The local HTTP server | `server` (`packages/server`) | the app / Speak Kit app | Listens on `127.0.0.1:47615` by default (`DEFAULT_PORT`). |
| Writing speech to a file | `export` (`ExportJob`, `/v1/export`) | Export audio | A job: create, poll progress, download, delete. WAV by the server, MP3 encoding in the desktop. |
| Playback core shared by extension and desktop | `player` (`packages/player`) | player | Gapless scheduling, queue, seek, speed. |
| Highlighting what is being read | `highlight` (CSS Custom Highlight API) | highlight | Sentence, word and find highlights; the page DOM is not changed. |
| Extension in-page controls | `launcher` (edge, bubble, gutter), `dock` | floating button, player bar | Content script UI under `features/launcher` and `features/player`. |
| Desktop windows | `main` window, `mini` (float window), `panel` | main window, mini player, panel | Renderer entries in `apps/desktop/src/renderer`. |
| Local file with the user's settings | `config.json` (desktop), `chrome.storage.sync/local` (extension) | settings | Validated by valibot; bad fields fall back to defaults. |

## Clashes to resolve
- `QueueItem` is defined twice (extension client and player package). The player package one is the source; the extension type should import or extend it. Owner: the packages that touch them (work packages 6, 9, 10).
- `Block` is defined twice (extension reader and desktop library contract). They have different shapes; keep both names until a shared shape is needed, then move one to `packages/protocol`.
- "doc", "document" and "item" are used for the same library entity in places. New code uses `document`; existing `doc` names change only when the file is edited for another reason.
- Words not to introduce: "reading" as a type name (use `session` or `reader`), "job" for anything but `ExportJob`, "profile" for voice or settings.
