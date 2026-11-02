# Design file restructure (2026-11-01)

> Historical reference (Lumen study, dark and light). The shipped look is Lockix, light only: see [design-system.md](design-system.md), [lockix-design-system.md](lockix-design-system.md) and [ADR 0015](decisions/0015-light-only.md). Dark and blue-fill statements below no longer apply.

Output: `designs/next/` (staging; `designs/screens` and `designs/review.html` are the old set and were not touched).
`speakkit.figcraft`, `screens/<id>.png` (2x, 2880x1800 for a 1440x900 frame), `manifest.json`, `review.html`, `build/sheets/s01-s23.png` (contact sheets).
Icon alignment check (`_measure.ts` and `_measure.py`) re-run after the changes: 0 fails.
Generator: `designs/gen` (`bun main.ts [id...]` builds everything in about 4 minutes; `bun build-review.ts` with `DIR=.../designs/next`; `python _sheets.py <next dir> 3 3 640 400`).

## Counts

- 5 pages, 45 numbered sections, 207 frames (all exported as PNG).
- 55 new screens (builders), 22 light twins, 44 frames labelled `LATER (v1.1)`, 15 labelled `SUPERSEDED by <id>`.
- 130 existing frames kept (re-skinned into the new shell, pill and theme).
- 12 explicit dark variants were merged into their base frame because dark is now the default (see id map).

## Structure (Lumen)

Pages: `Research & feature map` (3 sections), `Chrome extension` (14), `Desktop app` (22), `Foundations & components` (4), `Motion` (2).
Frame name rule: the text after the dash is the behaviour rule (first sentence of the screen note). Page frames never show the paragraph play gutter on a fresh page; B2 is the 'after reading started' state (pill playing, hover on a paragraph) and B17 shows only the 14 px edge tab.
Section frame: `N · Title — coverage`, 1140 px tall, white fill, 10% outline, numbered per page. Frames: `<ID> · Title — behavior rule`, 1440x900 at x=100, y=140, 100 px gaps; boards wider (2400 and 2160 px). Popup and in-page states sit inside the Chrome frame; narrow screens (popups, 760 px options) carry a rules card to the right of the screen.
Every flow is drawn dark first; light twins are suffixed `-L` and built by the same builder with light tokens (3 to 9 per surface).
Page background `#F5F5F5` as in Lumen.

## What changed in the existing screens

- Desktop shell (`kit.desktopWindow`): Lumen X15. Title bar 40 px with logo, sidebar toggle, back and forward, centered search 420x30 with `Ctrl K` chip, status pill (engine state), bell, window buttons; 248 px sidebar (New reading with `Ctrl N`, Home, Library, Voices, Engines, RECENT list, engine card, Settings); content on an inset card (8 px, r10, editor surface). A 60 px `rail` variant exists for narrow windows. All E, F, G, J, K frames use it.
- Settings (H): Lumen SD1. Title-bar field says `Search settings`, 248 px settings nav with group labels GENERAL, ENGINE, BROWSER, APP, 760 px column, rows 13/12 px.
- Read-aloud pill (`kit.dock`): Lumen F5 (id 46082) measured by layer data: 649x52, r999, `#252627`, 1 px `#FFFFFF14`, shadow 0 2 6 (6% light, 30% dark; Lockix scale, see design-system.md); previous 34, play 40 `#0078D4`, next 34, text 220 (`Paragraph 2 of 14 · 9 min left` 11 px over a 4 px bar), speed pill 54x30, voice pill `Heart · on device` with chevron, close 30. States: idle, preparing, reading, paused, done, error, engine unloaded, engine waking.
- Reading popover (`kit.readingPopover`): F5 "Reader options" 236 px: Sans / Serif / Dyslexic, Size, Width, Theme, and `Highlight sentence` (replaces Lumen's `Summary at top`).
- Reader view (B10, B12): F5 geometry: dark chrome, paper card inset 8 px (r12, `#F7F3EA`), 680 px column, 34/42 title, 19/32 body, current sentence band with word marker, popover top right, address-bar reader icon highlighted. Body font is Georgia (Source Serif 4, used by Lumen, is not installed here).
- Edge launcher: the vertical expanded pill is superseded by the read-aloud pill; the 14 px tab (B17) and reading tab (B19) stay.
- I5 clipboard prompt lost its buttons (Windows toast rule). Visible words "dock" became "pill" in the B and C frames.
- Added icons (Tabler outline, measured bounds): 42 new names in `gen/_add_icons.ts`.

## Id map: old to new

| Old | New | Note |
|---|---|---|
| A12 | A4 (dark) and A4-L | dark merged into the base frame |
| B11 | B6 (dark) and B6-L | merged |
| B12 | B12 | now the dark reader view, real fidelity |
| B10 | B10 | now the paper reader at F5 fidelity, light twin B10-L |
| B18, B20, B21 | B4, B6 | SUPERSEDED (vertical pill replaced by the read-aloud pill), kept visible |
| B4 to B9, B13 to B16 | same ids | pill instead of dock |
| C8 | C5 | merged |
| C11 | C9 | merged |
| D1 to D9 | W1 to W5 | SUPERSEDED: D1 to W1, D2 to W2, D3 to W2b, D4 to W3, D5 to W3b, D6 to W4, D7 and D9 to W5; D8 merged into W1 |
| E11, F12, G12, H10, J4, K9 | E2, F1, G1, H4, J1, K1 | dark merged |
| I6 | I10 | merged |
| I1, I2 | I10 | SUPERSEDED by short native menu plus panel |
| I7, I8 | I11 | SUPERSEDED (state is an icon state and a menu row) |
| E1 to E16, F1 to F16, J1 to J7 | same ids | tagged `LATER (v1.1)` |
| G3 to G7, G11, G14, G15 | same ids | voice cloning, `LATER (v1.1)` |
| all other A, C, G, H, I, K ids | same ids | unchanged ids, new look |

## New screens (55)

- Extension: A16 popup engine asleep, A17 popup waking the engine, B22 pill engine asleep, B23 pill waking, B24 Reading popover on the article, C13 pair this browser (token field, Paste, Test connection), C14 Open SpeakKit link flow, C15 per-site permissions, C16 shortcut conflict, C17 breakpoint rules, C18 narrow options page.
- Desktop: W0 first launch, W1 to W5 plus W2b and W3b setup window (960x680, 5-step stepper), L1 home, L2 command palette, L3 filtered palette, L4 narrow rail window, H12 and H13 memory (idle unload 1/5/15/never, load at startup, battery saver, live state), H14 notifications table, H15 startup and tray, H16 shortcut conflict, H17 settings search, H18 update pill and popover, H19 updating card, O1 engine states board, O2 and O3 engines unloaded and loading, I10 tray menu and left-click panel, I11 tray icon states and menus, I12 Windows toast set, I13 mini player storyboard, K11 quit confirmation, K12 edge-state board (12 cases), E17 empty-state board.
- Research: R1 feature map, R2 surfaces, R3 first read in four steps, R4 resource lifecycle, R5 Lumen patterns adopted, R6 decisions.
- Foundations: Q1 tokens, Q2 icon set, Q3 components and states, Q4 desktop components, Q5 extension components. Motion: MO1 tokens (83/167/250/333/120 ms, easing curves, spring 420/34, loops), MO2 18 per-element rules with reduce-motion fallback, MO3 principles.
- Light twins (22): B10-L, A1-L, A4-L, A9-L, B6-L, B15-L, C1-L, C6-L, C9-L; L1-L, W1-L, W3-L, H1-L, H12-L, G1-L, I10-L, K1-L, O1-L; Q3-L, Q4-L, Q5-L, MO1-L.

## Not done

- No `docs/decisions/0001-stack.md` entry: no package was added. The generator uses Tabler Icons (already in the repo) and FigCraft CLI.
- Lumen frames beyond F5 were read from `docs/lumen-study*.md` and the screen map, not re-measured; only F5 was re-read with the figcraft tools.
- Library and reader (E, F), export (J) and cloning (G3 to G7) were re-skinned, not redesigned, and are tagged LATER (v1.1). Their content (for example F7 display settings with Light/Sepia/Dark) still follows the old design and should be aligned with the Reading popover when v1.1 starts.
- Georgia replaces Source Serif 4; Dyslexic font is only a label.
- macOS tray (Lumen TR2) is not drawn; mobile and tablet frames are not drawn (not in scope).
- The frame names are ASCII-safe: colons become commas.
- Boards (R, Q, MO, O1, K12, E17) are drawn in a 1440x900 wrapper with small type; they are readable at 2x but denser than Lumen's boards.
- Frames are not linked as prototypes and nothing is componentized: the file is generated, not hand-edited. Run the generator to change it.

## Update 2026-11-01

- Solid transport glyphs (thin pause bars), on-accent key chip in primary buttons (`Ctrl N` in the sidebar), Lockix elevation (menu 0 1 2, popover and pill 0 2 6, dialog and palette 0 4 12; old 0 8 24 and 0 16 48 removed), gutter play button only after reading has started (B2 now shows the pill playing). All 207 frames, the .figcraft file, manifest, contact sheets and review.html rebuilt. Rules are in `design-system.md`.
