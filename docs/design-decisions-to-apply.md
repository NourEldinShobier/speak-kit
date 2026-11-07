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
| 2.2 | Panel margins match Lockix | Panel 8 from the right edge, panel 4 from the sidebar, 0 below the title bar. Title bar 36, search 28 high. (The 28 footer band that used to sit under the panel is removed, see 2.2a.) | Applied, except the band. |
| 2.2a | **Remove the footer band** (user, 2026-11-05) | The 28 px status band under the panel (engine, voice, readings) is gone in all 57 shell frames. The panel and sidebar grow by 20 px, so the panel is **8 px from the bottom**, equal to the 8 px right gap. Anything anchored to the panel's bottom edge (the reader's player bar) moves down by 20 with it. | **Design only.** Code still has the band: `--footer-h` in `lumen.css`, `footer-model.ts` and its test, the footer markup in the shell, and the `spacing.test.ts` and `shell.test.ts` checks that pin it (panel bottom 28, footer 28 high). Remove them and set the panel's bottom inset to 8. Generator drift: `designs/gen/kit.ts` `desktopWindow` still draws it. |
| 2.3 | No logo in the title bar | Title bar starts with the sidebar toggle, back and forward, then centred search. | Applied. |
| 2.4 | macOS title bar | Traffic lights at the left, left group after them, search centred, status pill, update pill and bell at the **far right**, with equal 4 gaps to the top and the right. Frames L1m and H1m. | Applied (code and frames). |
| 2.5 | Window controls | Minimize, maximize and close glyphs are pure black (`#000`), no grey. | Applied (code). |
| 2.6 | Per-platform radii | Windows: panel 8, tray, card, menu, mini player and dialog 10, controls 8. macOS: panel and tray 14, card and menu 10, window 12, dialog 16. | Applied. |
| 2.7 | Concentric hover radii | Inner radius is container radius minus gap: menu and select option 5, segmented option 6, palette row 4 on Windows and 8 on macOS. | Applied. |
| 2.8 | Light only | No dark theme anywhere. Only adaptation to dark host websites in the extension stays. | Applied. |
| 2.10 | **Title bar 38 high, search field 30 high** (user, 2026-11-06). Supersedes the 36 and 28 in 2.2. | Search field 420×30, no shadow, white fill, 1 `#E5E5E5` border, radius 8, 6 side padding. Icon, text and chip start 7 from the left, top and bottom. Sidebar toggle, back, forward and bell group move down 1 (y 5). Panel and sidebar start at y 38 and lose 2 of height, so their bottom edges do not move. Caption buttons are 38 high. | **Design only.** Code (`titleBarOverlay`, `shell.css` title bar 36, search 28, `spacing.test.ts` and `shell.test.ts`) still has 36 and 28. Generator drift. |
| 2.11 | "Ctrl K" chip in the search field copies the `kbd` style of the Secrets Watchman file (node 1287) | Fill `#ECECEC`, no border, radius 4, 16 high, 6 side padding, text `#5F6A7D` Inter Medium 12. Gaps around the chip equal the field's 7. | Design only. Code has the outlined chip. |
| 2.12 | **Remove the "Ready" status pill from every title bar** (user, 2026-11-05). The engine widget above Settings already shows the state. 93 pills deleted. | The not-ready pills ("Unloaded", "Loading", "Offline", 7 frames) stay, restyled like Secrets Watchman node 635: no background, an 8 dot `#C9CCD2`, text `#475467` Inter Medium 13, 6 apart. Open: the macOS Settings frame H1m still shows "Ready". | Design only. Code still renders the pill (`titleBarStatus`). Decide whether to keep a not-ready indicator at all. |
| 2.13 | "New reading" button: shortcut chip is solid, not outlined (user, 2026-11-06) | Button 36 high, fill `#201E25`. Chip 18 high, radius 4, fill `#3A3841` (no border), text white Inter Medium 11, 6 side padding. Chip is 9 from the top, bottom and right edges. The "+" icon box starts 9 from the left, so the visible "+" is 12 in and lines up with the nav icons; gap to the label is 12, so "New reading" stays aligned with the nav labels (x 37). | Design only. Code has the outlined chip (`Sidebar.tsx` and CSS). |
| 2.14 | macOS bell: container's right edge aligns with the panel's right edge (8 from the window edge) | Bell row moved 4 left in L1m and H1m. The bell button stays borderless; a visible container is an open question. | Design only. |
| 2.15 | Experiment on one frame (L1) that became the rule: no shadow on the search field. The tested alternative styles for the bell button (node 707 of the other file) were rejected and undone. | Search field has no shadow. Bell has no fill, border or shadow. | Design only. |
| 2.16 | **No narrow-window rail state** (user, 2026-11-06). The sidebar is either full or collapsed by the toggle at the top left of the title bar (frame L5, hidden). Frame L4 (48 px rail under 1025 px) is deleted. | The code has no rail, so nothing to remove there. The Responsive options page (C17) keeps its own 60 px rail for the extension options page, which is a separate decision. | Applied (design). |
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
1a. Remove the footer band from the real shell (2.2a) and set the panel's bottom inset to 8.
1b. Title bar 38 / search 30 (2.10), the solid chips (2.11, 2.13), "Ready" pill removal (2.12) and the macOS bell (2.14) in the shell and its tests.
2. Check that no footer, card or button shadow is clipped by `overflow` in the other windows.
3. Decide 1.4 (inset pill or top-corner rows) and 1.9 (equal left and right footer gaps).

## Not covered

This page lists what the chat history of this session and its summaries record. Decisions taken earlier in the project are in `docs/lockix-design-system.md`, `docs/lockix-spacing-audit.md` and `docs/design-restructure.md`. The generator in `designs/gen` is not kept in sync with direct edits; a full rebuild from it would undo sections 1.7, 1.9 and 2.10 to 2.14.

## 2.17 Reader player, sliders, find bar, destructive buttons (2026-11-07, design file edited directly)
- **Reader header:** five reading icons (search, Aa, bookmark, export, panel) with 44 px pitch, no mic. A 28 px "…" button (white, 1 px #E5E5E5 inside ring, r8) sits 22 px after the last icon and 22 px from the panel edge. Voice moves out of the header.
- **Reader footer (61 px band under the divider):** left: previous, back 10 s, round play/pause (40), forward 10 s, next. Then time, slider filling the width, end time. Right: speed pill, voice button (white, ring, r8, 26 high, voice name), sleep timer, volume, queue, 28 px "…" button. No title block on the left. Each toolbar's "…" opens "Customise toolbar" (switch list, no reordering in v1).
- **Slider (all sliders, from the Lockix file node 1405):** track 4 high r2 #ECECEC; fill #201E25 r2; thumb 18 white, 1 px inside #C3C6CC, shadow 0 1 2 at 10%, centred on the fill end. Replaces the blue fill and 16 px thumb.
- **Display popover:** auto layout, 16 padding, 16 gap. Font segmented toggle full width (container 32 high r8 #ECECEC, 2 px padding, tabs fill, selected tab white r6 shadow 0 1 3). Each slider is a group: label left and value right on one row, slider full width below. Toggle row: label left, switch right.
- **Find in text (F16):** floating card at the top right of the reading pane, 408×44, r10, white, 1 px #E5E5E5 ring, shadow 0 2 6 at 6%, 24 px from the right and 10 px from the top. It overlays the text; the text starts at the normal position (no band under the title). Contents: search field 240, count, previous, next, close.
- **Destructive buttons (Delete, Remove, Restart anyway, Cancel export, Replace):** same style as the Cancel button (white, 1 px #E5E5E5 inside ring, shadow 0 1 2 at 6%, r8) with red text #C62828. No filled red button. Suggested hover: fill #FEF2F2, ring #F2B8B8; pressed: #FDE4E4; focus: 2 px outer ring red at 40%; disabled: text at 40%. Hover, pressed and focus are not drawn yet.

## 2.18 Decisions since 2.17 (2026-11-07, design file edited directly; nothing here is in code yet)
- **Voice popover (28841) vs find card (29586):** the popover had a 1 px border plus a 1 px ring in its shadow, and clipping on, so the edge looked doubled and the shadow was cut. Rule for every floating card: one 1 px #E5E5E5 border, one shadow `0 2 6` at 6%, clipping off, scrollbar at the far right edge (3 px from it). Rows: labels in one column; selected row highlight full width, radius 6, check mark at the right. Other voice popovers were not checked.
- **"Recognizing text" (30469):** no card. Inline in the reading column (680 wide, aligned with title and subtitle): title left, Cancel button right (28 high, white, ring, r8), status line in 12 px #5F6A7D, 4 px progress bar full width (#ECECEC track, #201E25 fill). Gap 8.
- **"Recognize text on this computer?" dialog (30299):** height hugs content, clipping off; buttons 16 px from the bottom and the right.
- **Display card compact (53524):** values (19px, 1.7, 680px) and the switch end at the right edge of the white "Serif" tab, 2 px inside the grey track.
- **Display card (28232):** the compact card sits right-aligned in the reading panel, 24 px from its right edge, under the header icons. The large rebuilt popover was deleted at the user's request.
- **Voices toolbar:** search field 36 high, 264 wide on the left (ring and shadow `0 1 2` at 6%). The All, US English, UK English, Female and Male segments are replaced by a 36 px dropdown on the right ("Voices: all", 13 Medium, chevron, white, 1 px #E5E5E5, r8, shadow `0 1 2`). The dropdown menu is not drawn. Applied to the main Voices frame and three variants.
- **List view removed:** only the grid exists. Frame G13 (Voices, list view) and the Grid/List toggle are deleted. The code has no list view.
- **Voice drawer (31527):** spans the content panel height: y 38 to 791, 8 px from the right and the bottom. Header (arrows, "1 of 28", close) closer to the top (10 px padding); 14 px layout gap and 10 px extra below the header.
- **"Grade D" pill:** no outline. All grade pills are a soft fill with no stroke.
- **Library row menu button:** the kebab button from the Secrets Watchman file (node 13580 equivalent, 28×28, white, 1 px #E5E5E5, r8, shadow `0 1 2`), 16 px from the row's right edge.
- **Library drag and drop frames:** the dashed blue container has 8 px margins on all four sides.
- **Sort and voice dropdowns:** 36 high (was 28), label and chevron centred; same in the Paste dialog.
- **"Add pasted text" dialog (24283):** voice dropdown at the left of the footer; Cancel, Add and Add and play grouped at the right; 16 px bottom and right margin.
- **"New" pill text:** #1B2230 on the grey fill, in all library lists.
- **Search fields:** the inner field has no focus outline; only the outer focus ring remains.
- **Destructive buttons:** see 2.17.
- **Ready pill:** removed from every frame; the sidebar engine card shows the state. The not-ready pills (Unloaded, Loading, Offline) were restyled to a grey dot plus text (7 frames) and still exist.
- **Shell:** footer band removed; panel and sidebar end 8 px above the window's bottom; engine card and Settings at the bottom of the sidebar; title bar 38 high, search 30 (see 2.10 to 2.14).
- **Setup window:** white background, full card borders (clipping off on wrapper frames), footer buttons 16 px from the bottom and 20 px from the right, Back arrow 26 px from the left, headline 32 px under the stepper, selected engine row is a light tint with a white icon tile (section 1).

**Open questions:** inset pill or top-corner rows for the selected engine (1.4); equal left and right footer gaps in the setup window (1.9); whether the Voices dropdown needs a menu frame; whether other voice popovers share the double border.

## 2.19 Decisions since 2.18 (2026-11-07, design file edited directly; nothing here is in code yet)
- **Control rows (all settings pages, desktop and extension):** a row with a 36 px control (dropdown, segmented control, input, button, chips) is 68 high: 16 px above, below and to the right of the control; the title block is centred. Search fields, dropdowns, inputs and icon buttons that were 28 px are 36 px (pencil and trash buttons 36×36). Toggle-only cards get 4 px more space under the last row. Dialog footers keep 16 px under the buttons.
- **Desktop settings:** Language dropdown, Voice row, "Default for other sites" rows, the Storage "Models" and "Logs" buttons and the "Delete…" row follow the 16 px rule. The Delete button in dialogs uses the destructive style of 2.17.
- **Quit dialogs:** "Quit" is destructive (white, ring, red text); "Keep running in tray" is the plain secondary style.
- **About / Updates:** "Remind me later" is removed.
- **Tray panel:** the design section "16 · Tray panel and menu" and frames I1 and I2 (marked superseded) are deleted. The tray icon, its native menu and the Settings → General tray options stay in code until decided otherwise. Open: whether the left-click tray panel is dropped too.
- **Export audio (section 19):** all controls 36 px (Format and bitrate dropdowns, Voice select, File name field, Browse). The rendering dialog has a full-width progress bar (4 px, `#ECECEC` track, `#201E25` fill) with proper spacing; the sidebar export pill uses the light ring plus a dark progress line.
- **Mini player (section 17):** pause bars 3 px wide with a 3 px gap; lock and close buttons level with the title, 14 px from the right edge; progress bar 4 px high, full inner width inset 14, dark fill while playing and paused, a short moving segment while preparing, full when finished, red on error. The error card is the same size as the others (362×114).
- **Model download card (setup step 4 and Engines):** no right-hand badge. Left: name, then "62% · 110 MB of 177 MB" (paused: "Paused at 62% · 110 MB of 177 MB"). Progress bar full card width inset 16, 6 high, `#ECECEC` track, `#201E25` fill.
- **Extension popup:** progress sliders use the 2.17 slider (4 px track, dark fill, 18 px thumb). The voice picker (A6) has no player strip: header "Voice / Done", search 36, one row of three 104 px dropdowns (language, accent, voice), the voice list with preview buttons, one note line. The speed picker (A7): "Speed" left, value right, full-width slider with 0.5x and 3x under its ends, presets in a grey segmented track, "Reset to 1x" at the bottom left. Floating cards use one 1 px `#E5E5E5` border, `0 2 6` at 6%, no clipping.
- **Selection bubble (B1):** 44 high, 6 px padding, 6 px gaps, 32 px buttons (Listen 14 px side padding; settings and copy 32×32, radius 8).
- **Speed popover on the page pill:** 300×184: title and value row, slider, presets segmented, "Reset to 1x". Reading popover sliders (Size, Width) use the same slider.
- **Edge launcher:** the slim vertical progress rail (variation 2, node 53806) is the collapsed reading state, centred vertically at the right edge. Old frames B19 and B21 still show the previous pause-button tab and need replacing in the design.
- **Extension options pages:** window background `#F0F0F0`, menu directly on the grey (selected item `#E4E4E4`), content in one white panel (radius 8, 4 px gap to the menu and window edges). Setting cards: white, 1 px `#E5E5E5` ring, `0 1 2` at 6%, radius 8.
- **Options page controls:** "Reset section" is a 36 px secondary button (white, ring, dark text and icon). The connection banner has "Copy details" (button inside the banner) instead of "Details". No dividers around the "reconnects by itself" banner. Shortcuts: key chips and the "Not assigned" badge sit right-aligned next to the pencil button. Site permissions: "Use this tab's site" is a chip inside the add-site field; the Always-show dropdown (177 wide) lines up with the dropdowns in the rule rows; Add is a 36×36 "+" button above the trash buttons. Selected swatch rings are dark, not blue.
- **Voice and speed (options):** Default voice, Speed and Pause rows and the Preview row follow the 16 px rule; the Speed slider uses the dark slider.
