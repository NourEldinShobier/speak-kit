# Lumen study: what SpeakKit copies (2026-11-01)

> Historical reference (Lumen study, dark and light). The shipped look is Lockix, light only: see [design-system.md](design-system.md), [lockix-design-system.md](lockix-design-system.md) and [ADR 0015](decisions/0015-light-only.md). Dark and blue-fill statements below no longer apply.

Sources read: workspace `D:\workspaces\perplexity` (WORKSPACE.md, `docs/lumen-repo-docs/*`), the design file `Lumen — AI answer engine (open-source Perplexity alternative).figcraft` (10 pages, 50,785 layers; read: variable collection, "Components and states" board, "Desktop components" board, desktop main window X15/X16, browser feature F5 "Reader mode + read aloud").
Not read in depth yet: the other ~120 frames (settings, onboarding, agents, MCP, mobile). A deeper pass is part of the restructure workflow below.

## 1. How the Lumen project is organized

**Workspace** (four folders, same as ours): `code/` `designs/` `docs/` `drive/` `tools/`. `docs/` holds one folder per doc set, each with a README. `drive/<project>-chat-handoff-N/` holds `HANDOFF.md` plus per-day transcripts built by `tools/extract-transcript.ts`.

**Repo** (Bun + Tauri 2): `docs/decisions/0001-stack.md` (ADR: every package justified), `CLAUDE.md` (8 lines of rules), `CONTRIBUTING.md`, `docs/architecture.md` (mermaid, request walkthrough, build), `docs/testing.md` (pyramid), `.githooks/commit-msg` (Conventional Commits).
- **Features own their code**: `features/<name>/{contract.ts, server.ts, queries.ts, <name>-page.tsx, index.ts, *.test.ts, *.int.test.ts}`. Other code imports a feature only through `index.ts` / `server.ts`; `scripts/check-boundaries.ts` enforces it inside lint.
- **Contracts first**: Zod schemas in `contract.ts` shared by server and client are the API's single source of truth.
- **Test pyramid**: unit, integration (real server + real DB), component, end-to-end on the production build, screenshots.
- **Screenshots are tied to the design**: file name `<figma-frame-id>-<what>-<theme>.png` (for example `L1-home-dark.png`), baselines rendered in the Playwright Docker image with self-hosted fonts, so they match CI pixel for pixel.

**Design file**: pages by surface (Research & feature map, Web app, Desktop app, Foundations & components, Browser & devices, Motion, Browser layouts, Generative UI, Browser features, Arc-inspired features). Inside a page: numbered sections `N · Title — what it covers`, 1140 px tall, filled white with a 10% outline; inside a section: frames 1440x900 named `<Prefix><n> · Title — description` (X15, F5, L1...). Every flow has its edge states, light mode and a component board next to it. Superseded work is kept and labelled `SUPERSEDED by ...`; later work is labelled `LATER (v2)`.

## 2. The app layout Lumen uses (desktop shell, X15/X16)
- Title bar 40 px: logo + app name, sidebar toggle, back/forward, **centered global search** (`Search threads, files and commands`, shortcut chip Ctrl K), status pill (`1 agent working`), bell, window controls.
- Left sidebar about 248 px on the window surface: primary button `New thread` with shortcut chip, nav items 32 px (Home, Discover, Spaces, Library, Agents, Tasks, Files, Extensions) with a selected fill, a `Recent` section label (11 px caps) and plain list rows, account row at the bottom (avatar, name, plan, settings gear).
- Content: one rounded card inset 8 px (editor surface, 12 px radius, 1 px divider), content centered at about 760 px; optional right panel (Sources) on the same card surface.
- Composer: large rounded input (14 px radius) with mode segmented pill (Search / Research / Deep), model select, mic, round primary send.
- Home widgets: three equal cards (running now, next task, models) with a status line each.
- Tone: dense, 13 px, icons 16 px stroke 1.5, no illustrations, color only for state.

## 3. The read-aloud pattern Lumen already designed (F5) — our extension should match it
- Floating **dark pill** at bottom center: previous, 40 px blue play/pause, next, text `Paragraph 2 of 14 · 9 min left` over a thin progress bar, speed pill `1.25x`, voice `Aria · on device` with chevron, close X.
- Reading panel popover top right: segmented `Sans / Serif / Dyslexic`, rows Size, Width, Theme, a toggle. Current paragraph highlighted with a soft sand block (on the paper theme).
- It lives in a browser frame with address-bar actions (reader icon, bookmark, shield, extensions, mic, Assistant).
Consequences for SpeakKit: dock = this pill (paragraph-based progress text, `on device` label), reader view and its display panel are part of v1 (they were deprioritized earlier), highlight is paragraph + sentence + word.

## 4. Restructure plan (to execute after the two running workflows finish)
1. **Repo**: add `CLAUDE.md`, `CONTRIBUTING.md`, `docs/decisions/0001-stack.md` (done now), `.githooks/commit-msg`, `scripts/check-boundaries.ts` in lint.
2. **Features own their code** in the extension and desktop: `src/features/{player,reader,highlight,launcher,queue,pairing,settings}/` each with `contract.ts` (types and zod-free validators from `@speakkit/protocol`), `index.ts`, tests; the shell (`app/`) imports features only through `index.ts`.
3. **Shared UI kit** `@speakkit/ui` from the real Lumen components (workflow `lumen-components`, running).
4. **Screens named by frame id**: `e2e/__screenshots__/<ID>-<what>-<theme>.png`, generated in the Playwright Docker image on CI; local Windows runs only diff against the design PNGs.
5. **Design file** rebuilt as Lumen's structure: pages `Research & feature map`, `Chrome extension`, `Desktop app`, `Foundations & components`, `Motion`; numbered sections of 1140 px; frames 1440x900 (popup shown inside a browser frame); edge states and light mode per flow; component boards; `SUPERSEDED` / `LATER (v1.1)` labels (library and reader screens D-F).
6. **Desktop shell** copies the Lumen shell: title bar with global search and status pill, 248 px sidebar (New reading, Home, Library, Voices, Engines, Settings, Recent), inset content card, right outline/voice panel.
7. **Extension**: dock and reader view follow F5 exactly; popup follows the desktop component board (header, now-playing card, segmented controls).
8. **Docs**: per-doc-set folders with README (`docs/speakkit-research`, `docs/design-review`, `docs/lumen-components`), `drive/speakkit-chat-handoff-1/HANDOFF.md`, `tools/extract-transcript.ts`.
