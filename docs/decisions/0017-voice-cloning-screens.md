# ADR 0017: Voice cloning screens: voice style, cloning flow and microphone permission

## Status
Accepted, 2026-11-08.

Label: [D] decided. Review by: 2027-01-02. Confirmed or reversed by: none.

The user pre-approved additive wire changes for this work (instruction of 2026-11-07, "write an ADR for anything that needs one").

## Context
The cloning API (`POST /v1/voices/clone`, clip checks, Chatterbox sidecar) was built and run on real hardware (ADR 0016), but the screens G3 to G7, G11, G14, G15 and K6 were not. Building them raised four questions the records did not answer:

1. G6 and G11 show an Exaggeration slider (0.50 is neutral) and a Pace slider. The protocol had no style parameter.
2. G6 shows "Play test" before the voice is saved, but the server only knows a voice after `POST /v1/voices/clone`, which takes the name in the same call, while the name is typed after the clip was analysed (G5 then G6).
3. A reference clip can be recorded, so the renderer needs the microphone, which every window denied.
4. The Electron renderer cannot see why the server rejected a clip, because `ServerError` kept only the message.

## Decision
Wire protocol (additive, `API_VERSION` stays 1):
- `ClonedVoice` gains optional `exaggeration` and `pace`, numbers from 0 to 1. Absent means the model's neutral 0.5.
- New `PATCH /v1/voices/<id>` with `UpdateVoiceRequest {name?, exaggeration?, pace?}` (at least one field; name 1 to 60 characters; style 0 to 1) answers 200 with the `ClonedVoice`, 404 for an unknown id, 400 for a bad body.
- Sidecar protocol: the `synth` request takes optional `exaggeration` and `cfg_weight` (the model's classifier-free guidance weight, which the UI calls Pace: lower speaks more slowly). The engine sends the stored style of a cloned voice with every request; the stock `chatterbox` voice sends none.
- The error body of `422 clip-rejected` already carried `checks`; `errorBodySchema` now parses it, and new runtime schemas `clonedVoiceSchema` and `clonedVoiceListSchema` validate the cloning answers in the desktop app.

Cloning flow (desktop renderer, `features/cloning`):
- Choose (file or record, with the consent checkbox) -> review take (recordings only) -> analyzing -> name, test and style -> save. A rejected clip shows G7: one row per `CloneCheck`.
- The server creates the voice when the clip passes. The name step then renames it and sets the style with PATCH. So "Play test" speaks the real voice through the real engine. Cancelling the name step deletes the voice again. A voice left behind by a crash in that step is named after the clip ("Voice <n>") and appears under "Your voices", where it can be deleted.
- Cloned voices are spoken by Chatterbox only. The flow makes Chatterbox the engine in use (`POST /v1/engines/select`) when the person continues from the choose step, and the screen says so before they continue. Kokoro stays installed; "Use this engine" on the Engines page switches back.
- The renderer decodes the picked or recorded audio with the Web Audio API, mixes it to mono, resamples to 24 kHz (a WAV below 16 kHz keeps its rate so the server's sample-rate check still fires) and sends a 16-bit WAV. Nothing is stored by the renderer; the recording is kept in memory until the voice is saved or cancelled.
- The consent text says the person has the right to clone this voice. The server still requires `consent: true`.

Microphone (Electron main):
- `createSecureWindow` takes `microphone: true` for the main window only. Its permission request and check handlers grant `media` when the request names audio only (no video) and comes from a `file:` page of the app (`permissions.ts`). Every other permission, window and origin stays denied.
- "Open system settings" calls `shell.openExternal` with an address from a fixed table (`ms-settings:privacy-microphone` on Windows, the Privacy_Microphone pane URL on macOS; nothing on Linux, where the button is not shown). The renderer sends a name, not an address.
- macOS needs `NSMicrophoneUsageDescription`; it is added to `electron-builder.yml`. Not verified on a Mac.

Tests only: `SPEAKKIT_FAKE_CHATTERBOX` (`<command>|<script>`, ignored in a packaged app and compiled out of the shipped build) puts Chatterbox on a pretend GPU with the stand-in sidecar so the Electron tests can drive the flow without Python. The tests pass Chromium's fake media device switches on the command line; the app never sets them.

## Evidence
Tests: `packages/protocol/src/{golden,schemas,surface}.test.ts`, `packages/engine/tests/clone.test.ts`, `packages/server/tests/engines.test.ts` (PATCH, style reaches the sidecar), `apps/desktop/src/main/{permissions,secure-window}.test.ts`, the cloning feature tests and `apps/desktop/tests/cloning.test.ts`. The real run on the RTX 4080 is in `docs/perf.md`.

## Alternatives considered
- A `dryRun` or `preview` clone route so the test could play before anything is stored: rejected, it duplicates the clone route and the test would speak through a path the saved voice does not use.
- Naming the voice before analysis (G3 asks for a name): rejected, the design asks for it after the clip is known to be good.
- Sending style per `POST /v1/speak` request: rejected, the extension and every other client would then carry it, and style belongs to the voice.
- `getUserMedia` from the main process or a native recorder: rejected, Chromium's own capture plus the permission handler needs no dependency.

## Consequences
One new route and two optional fields on the wire; an old client ignores them. A crashed name step can leave a voice named after its clip. Cloning switches the engine in use to Chatterbox, which holds the GPU while it is loaded; the idle unload still applies.

## Licence
None.

## Open questions for the user
None.
