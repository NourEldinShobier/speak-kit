# ADR 0016: Chatterbox end to end: failure reasons, cancel, packaged sidecar, setup choice

## Status
Accepted, 2026-11-07.

Label: [D] decided. Review by: 2027-01-02. Confirmed or reversed by: none.

The user pre-approved additive wire changes for this work (instruction of 2026-11-07, "write an ADR for anything that needs one").

## Context
Chatterbox was built and tested against a fake sidecar, then run once on real hardware (perf.md, 2026-11-01). Running it again on 2026-11-07 through the product's installer and the server found four gaps:

1. The weights download tripped the 120 s sidecar watchdog. `huggingface_hub` 1.33 downloads through hf-xet, which reports no byte progress for minutes, so the sidecar printed nothing and the host killed it.
2. The packaged desktop app did not contain `chatterbox_sidecar.py` (`defaultScript()` looks next to the bundled chunk), so an installed Chatterbox could not load.
3. Failures a person can act on (GPU out of memory, disk full) surfaced as an English error string, an install could not be cancelled, and an app killed during an install left a half-built environment that looked installed or broken.
4. The setup wizard showed Chatterbox as "Not available yet".

## Decision
Wire protocol (additive, `API_VERSION` stays 1):
- `EngineReason` gains `out-of-memory` and `disk-full`. `out-of-memory`: the GPU ran out of memory while loading (state `error`) or generating (state `unloaded`, detail holds the CUDA text; the sidecar process is ended so the GPU memory is returned, and the next request loads a fresh one). It is not counted by the crash-loop guard. `disk-full`: an install found less than 10 GB free or pip, uv or the weights download ran out of space (state `missing` after an install, state `error` after a weights download), detail names the sizes.
- `POST /v1/engines/<id>/cancel` answers 200 with the engine list once a running install has ended (installer processes killed with their children, the partial environment deleted). It does nothing for an engine that is not installing.
- Sidecar protocol: the `error` and `fatal` lines take an optional `code` (`out-of-memory` | `disk-full`). Old hosts ignore it. During the weights download the sidecar repeats its last `downloading` progress every 5 s.
- A synthesis failure on the stream stays the existing error frame `synthesis-failed` with the engine's message; the engine list carries the reason. No new frame or error code.

Engine behaviour:
- Install order: free-space check (10 GB, `statfs`), `installing` marker file, installer, `installed` marker, marker removed. A marker found at start-up means the app died mid-install: `env/` and the marker are deleted before the engine reports its state. Cancel, failure and `close()` (app quit) use the same clean-up.
- The sidecar sets `HF_HUB_DISABLE_XET=1` (plain HTTP downloads report byte progress) and sends the heartbeat above.

Packaging: electron-builder `extraResources` copies `packages/engine/sidecar/*.py` to `resources/chatterbox/`. The main process resolves it (`resources/chatterbox`, else the engine package's own file in development) and passes `sidecarScript` to `createChatterbox`. `smoke-packaged.mjs` and `smoke-installer.mjs` fail when the file is missing.

Setup: Kokoro stays the default and is always installed as the fallback. Chatterbox is selectable in the engine step when the server's engine list says it can be installed (NVIDIA GPU with 4 GB or more, uv or Python 3.10 to 3.12), and is shown disabled with the real reason otherwise. Choosing it is kept in the wizard state; "Open Speak Kit" starts the install in the background and the Engines page shows its progress. The engine in use stays Kokoro until the person presses "Use this engine"; the install never switches engines by itself.

## Evidence
- Real run 2026-11-07, RTX 4080 Laptop GPU, uv 0.11.3, torch 2.6.0+cu124, huggingface_hub 1.33.0: first load failed with `chatterbox sidecar sent nothing for 120 s` during the 3.2 GB download (`packages/engine/tests/real-chatterbox.test.ts`); after the change the same test passed with the download inside a 321 s load. Numbers are in `docs/perf.md`.
- Tests: `packages/engine/tests/chatterbox-faults.test.ts` (out of memory, cancel, marker, disk), `packages/server/tests/chatterbox-faults.test.ts` (cancel route, stream errors, switch during playback), `apps/desktop/tests/packaging.test.ts`, `apps/desktop/src/shared/engines.test.ts`, `apps/desktop/src/renderer/features/wizard/model.test.ts`.
- Not measured: a packaged build installing Chatterbox on a machine without Python; an out-of-memory error on a real GPU (the fake sidecar produces it); RTX 50-series.

## Alternatives considered
- A new error code `out-of-memory` on the stream frame: rejected, the extension has no screen for it and the engine list already says why.
- Switching to Chatterbox automatically when its install finishes: rejected, a 2.4 GB install ending would change the voice mid-use without the person asking.
- Keeping hf-xet and parsing its log for progress: rejected, plain HTTP is slower on fast links but reports progress through the existing tqdm hook and removes a dependency on an undocumented log format.
- `asarUnpack`: not applicable, the app is not packed into an asar (electron-builder.yml).

## Consequences
The Engines page can name a cause and offer the matching action. A killed app no longer leaves a broken install. Weights download is slightly slower without hf-xet. Guardrail: `tests/packaging.test.ts` and the two smoke scripts fail without the script in `resources/chatterbox`; `packages/protocol/src/schemas.test.ts` lists every reason.

## Licence
None.

## Decision-record amendment
`docs/decisions/0001-stack.md`, Chatterbox section, install row: add "the sidecar turns off hf-xet (`HF_HUB_DISABLE_XET=1`) because its downloads report no progress and tripped the 120 s watchdog; installs check for 10 GB of free space first".

## Open questions for the user
None.
