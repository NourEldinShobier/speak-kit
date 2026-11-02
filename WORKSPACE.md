# speak-it workspace (product name: SpeakKit)

Home for the local-first text-to-speech reader (name: SpeakKit): Chrome extension + Electron desktop app, Kokoro-82M and Chatterbox engines.

Planned stack: Electron, React, TypeScript, Vite+ (Vite), `kokoro-js` / `onnxruntime-node`, optional Chatterbox sidecar. Details in `docs/research/local-models.md`.

| Folder | What is in it |
|---|---|
| `code/` | pnpm workspace: `packages/{protocol,engine,server,ui}`, `apps/{extension,desktop}`, `e2e/`; CLAUDE.md, CONTRIBUTING.md, `.githooks/` |
| `designs/` | `review.html` (open this to review and approve), `screens/<ID>.png` (107 screens), `manifest.json`, `speakkit.figcraft` (FigCraft source), `gen/` (TypeScript generator), `build/` (intermediates) |
| `docs/research/` | `product-research.md`, `local-models.md`, `logo-research.md` |
| `drive/` | chat handoffs (none yet) |
| `tools/` | `extract-transcript.ts` (builds `drive/` handoffs, copied from the Lumen workspace) |

## Rebuild the designs
```bash
cd designs/gen
bun main.ts            # regenerates speakkit.figcraft, screens/*.png, manifest.json
bun build-review.ts    # regenerates review.html (APP_NAME=... to change the title)
```
Needs `figcraft-cli.exe` (default `<home>/AppData/Local/Programs/FigCraft/`, override with the `FIGCRAFT_CLI` env var) and `bun`. Screens are code: one function per screen in `gen/s_*.ts` (A ext popup, B on-page, C options/side panel in `s_ext.ts`/`s_opts.ts`; D onboarding, E library, F reader in `s_app.ts`; G voices/engines, H settings in `s_voices.ts`; I tray, J export, K errors in `s_sys.ts`). To rename the product, find-and-replace "SpeakKit" in `gen/` and rebuild.

## Docs map
- `docs/architecture.md` contract and ownership, `docs/design-system.md` Lumen tokens and rules, `docs/lumen-study.md` what is copied from Lumen and the restructure plan, `docs/lumen-components.md` real component specs, `docs/decisions/0001-stack.md` stack ADR, `docs/perf.md`, `docs/testing.md`, `docs/visual-fidelity.md` (written by the agents).

## Temporary files
Everything stays inside this folder. Agent worktrees live in `tmp/wt/<name>` (git-ignored), scratch files in `tmp/`; remove them when the task is done. Nothing is created next to `speak-it` in `D:\workspaces`.
