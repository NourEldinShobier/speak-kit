# Design decisions to apply to the code

The design source is `designs/speakkit.figcraft`. This page records every design decision taken in chat that changed the design file, with its status in the code. Values are in px. Frame ids come from `designs/gen/plan.ts` (W = setup window, H = settings, L = shell, A, B and C = extension).

Status: **Applied** means the code matches. **Design only** means the design file is ahead of the code and the code change is still to do. **Generator drift** means `designs/gen` does not have the change either, because design edits are made directly in the file now (user rule, 2026-11-05).

## 1. Setup window (W0 to W5b) — design only

| # | Decision | Value | Code location | Status |
|---|---|---|---|---|
| 1.1 | Window background is white, like the settings panel | `--surface-card` (#FFFFFF). The native window colour is white while setup runs, so there is no grey flash; the app window stays grey afterwards. | `setup.css` `.sk-setup`, `main-window.ts` `backgroundColor` | Design only. A first code attempt was reverted at the user's request. Generator drift. |
| 1.2 | Card borders are complete: wrappers around cards must not clip | Card ring `0 0 0 1px #EBEBEB` plus `0 1px 2px` at 5%. The ring is drawn outside the card, so any parent with clipping cuts it. | `.sk-setup__col` has `overflow-y: auto`, which clips the ring at the left, right and top. Add padding or `overflow: visible` so the ring and the button shadows show. | Design only. Generator fixed for all frames. |
| 1.3 | More space between stepper and headline (steps 2 to 5) | Headline, subtitle and content move down 12. The gap under the stepper goes from about 20 to 32. | `.sk-setup__col` `padding-top` 8 → 20 | Design only. Generator mirrored. |
| 1.4 | Selected engine row (W2) is a faint tint, not a heavy fill | Row fill `rgba(0,0,0,.04)` (the Lockix hover tone), not `#F0F0F0`. Only the top two corners are rounded, matching the card; the bottom meets the divider flat. | Engine row selected state in `EngineStep.tsx` and its CSS (`--fill-selected` is `#F0F0F0` today) | Design only. Generator mirrored. Open question: an inset rounded pill with a small margin is the alternative. |
| 1.5 | Engine icon tile reads on the tint | Tile is white with a 1 border `#E5E5E5` (it was `#F5F5F5`, lighter than the row, so it blended in). | Engine tile CSS | Design only. Generator mirrored. |
| 1.6 | "Connect your browser" cards share one padding | Row padding 14 vertical on all three cards ("Install the extension" had 3, the test-connection row 11, the token card 14). The same 14 applies to the download step's model row and the final step's "Play sample" row. | `ConnectStep.tsx`, `DownloadStep.tsx`, `DoneStep.tsx` | Design only. Generator mirrored. |
| 1.7 | Footer: buttons sit lower | Footer row stays 64 high with a 1 top divider. Bottom padding 8, so buttons (36 high) sit **16 from the bottom**. History: 14, then 28, then 20, then 16. | `.sk-setup__foot` (padding is `0 28px` today) | Design only. Generator still has 20 (drift). |
| 1.8 | Footer: right edge | Primary button 20 from the right (right padding 20). | `.sk-setup__foot` | Design only. Generator mirrored. |
| 1.9 | Footer: "Back" sits further right | Left padding 12. The ghost button has 14 inner padding, so the arrow is about **26 from the left**. History: 42, then 20, then 26. The left and right gaps differ by 6; equal would be left padding 6 (arrow 20) or right padding 14. | `.sk-setup__foot` | Design only. Generator still has 6 (drift). |

## 2. Shell and settings — applied unless noted

| # | Decision | Value | Status |
|---|---|---|---|
| 2.1 | Settings back arrow closes Settings, with a "Close settings" tooltip; Esc closes it too. Sections inside Settings do not add history entries. | Arrow button labelled "Close settings" | Applied (code and frame H1). |
| 2.2 | Panel margins match Lockix | Panel 8 from the right edge, a 28 footer band under it with a one-line status, panel 4 from the sidebar, 0 below the title bar. Title bar 36, search 28 high. | Applied. |
| 2.3 | No logo in the title bar | Title bar starts with the sidebar toggle, back and forward, then centred search. | Applied. |
| 2.4 | macOS title bar | Traffic lights at the left, left group after them, search centred, status pill, update pill and bell at the **far right**, with equal 4 gaps to the top and the right. Frames L1m and H1m. | Applied (code and frames). |
| 2.5 | Window controls | Minimize, maximize and close glyphs are pure black (`#000`), no grey. | Applied (code). |
| 2.6 | Per-platform radii | Windows: panel 8, tray, card, menu, mini player and dialog 10, controls 8. macOS: panel and tray 14, card and menu 10, window 12, dialog 16. | Applied. |
| 2.7 | Concentric hover radii | Inner radius is container radius minus gap: menu and select option 5, segmented option 6, palette row 4 on Windows and 8 on macOS. | Applied. |
| 2.8 | Light only | No dark theme anywhere. Only adaptation to dark host websites in the extension stays. | Applied. |
| 2.9 | macOS Dock | Closing the window hides the Dock icon and the app stays in the menu bar; showing the window brings it back. | Applied in code (commit `7eb2fd1`). No design frame. |

## 3. Extension — applied

| # | Decision | Status |
|---|---|---|
| 3.1 | Per-tab close control (×) on the pill, with a tooltip. An overflow menu has "Settings", "Hide for this tab" and "Hide on this site". The popup of a hidden tab shows "Show on this page". Frames B33 to B38, A24. | Applied. |
| 3.2 | The paragraph play button appears only after reading has started on that page. | Applied. |
| 3.3 | No "ready" notifications (app, engine or model). | Applied. |
| 3.4 | The extension never reads the clipboard; "Paste new token" is replaced by "Re-pair". | Applied. |
| 3.5 | Inline code in articles is read aloud, not skipped. | Applied. |

## 4. Icons, logo and visual system — applied

| # | Decision | Status |
|---|---|---|
| 4.1 | App icon: continuous-corner squircle, 22.4% radius, four puzzle pieces clipped to it, white seams. macOS body fills 824 of 1024 with a baked shadow; Windows icon at 94%. | Applied. |
| 4.2 | One line weight in the logo (seams, hub ring and wave equal, 41 on the 1024 canvas). | Applied. |
| 4.3 | Lockix design system: near-black primary button, outline secondary, 32×20 switch, 36 high fields, popovers with a ring and a short shadow. Tactile refinements: hover only on fine pointers, tabular figures, press scale 0.97. | Applied. |
| 4.4 | The "Logo" page of the figcraft file holds the logo components. | Applied (design). |

## Still to do in code

1. Everything in section 1 (setup window). Start with 1.2, because the clipped ring also affects the real window.
2. Check that no footer, card or button shadow is clipped by `overflow` in the other windows.
3. Decide 1.4 (inset pill or top-corner rows) and 1.9 (equal left and right footer gaps).

## Not covered

This page lists what the chat history of this session and its summaries record. Decisions taken earlier in the project are in `docs/lockix-design-system.md`, `docs/lockix-spacing-audit.md` and `docs/design-restructure.md`. The generator in `designs/gen` is not kept in sync with direct edits; a full rebuild from it would undo section 1.7 and 1.9.
