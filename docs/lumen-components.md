# Lumen component spec (extracted)

> Historical reference (Lumen study, dark and light). The shipped look is Lockix, light only: see [design-system.md](design-system.md), [lockix-design-system.md](lockix-design-system.md) and [ADR 0015](decisions/0015-light-only.md). Dark and blue-fill statements below no longer apply.

Source: `D:/workspaces/perplexity/designs/Lumen — AI answer engine (open-source Perplexity alternative).figcraft` (read from the file, not guessed). Machine-readable twin: `code/packages/ui/spec/lumen-spec.json` (schema `lumen-spec/1`: `tokens`, `components.<name>.{states, anatomy, notes}`, `patterns`).

Colour cells read `variable (dark / light)`. Alpha tokens are resolved to rgba. "paint opacity" is the opacity of the fill/stroke paint on top of the variable. Node ids refer to the .figcraft file. Images are in `docs/lumen-components/` named `<component>-<state>-<dark|light>.png` (2x). The light images were rendered by switching the board frame to the Light mode of the variable collection (the file has no separate light component board; the light-mode section 14562 holds full screens).

## Global rules

- **hover**: fill/hover overlay on ghost/secondary/icon/menu/nav/row; primary button hover = tag/blue (#4A9EFF dark, #0A6ED1 light); input hover = stroke text/tertiary
- **pressed**: fill/selected overlay (primary: unchanged accent/default in the board)
- **selected**: fill/selected (nav item, toggle button on, segmented option, palette active row)
- **focus**: accent/default stroke: 2 px outside on buttons/pills (drawn offset 0, although the board header says 2 px offset), 2 px inside on text input and hotkey recorder, 1 px inside on composer
- **disabled**: opacity 0.4 on buttons, inputs, toggles, radios, menu items; 0.5 on composer and excluded source card
- **loading**: loader-2 icon replaces the leading icon, label and width unchanged
- **danger**: tag/red text (ghost danger) or tag/red fill with text-on-accent (confirmed destructive); error border tag/red 1 px inside
- **motion**: States: rest, hover (fill/hover), pressed (fill/selected), focus (2 px accent ring, 2 px offset), disabled (40% opacity), loading (spinner replaces icon, width kept). Motion: 83 ms hover, 167 ms press/fade, decelerate curve.
- **layout model**: All frames use box-sizing border-box with strokes included in the size (layout.strokes_included = true). Strokes default to 1 px inside. "Hug" = content size, "fill" = flex 1, "fixed" = explicit px.
- **icons**: Tabler outline, MIT; masters are 24x24 components named "Icon / <name>" on page "Foundations & components" (id 40210). Stroke 1.5px center at every size. Every icon instance in the file (12 to 63 px, 5,000+ instances) keeps stroke weight 1.5 px; the geometry is scaled (16 px icon = 24 px geometry x 2/3) but the stroke is NOT scaled. A 16 px icon therefore has a 1.5 px stroke on screen, which is 2.25 in the 24-unit viewBox. In SVG with viewBox "0 0 24 24" use stroke-width = 1.5 * 24 / renderedSize (2.25 at 16, 2.571 at 14, 3 at 12, 2 at 18, 1.8 at 20) or vector-effect: non-scaling-stroke with stroke-width 1.5.
- **icon placement**: Icon boxes are centred: in a 32 px button the 16 px icon sits at (12, 8) = vertically centred and exactly level with the 16 px text box (dyFromTextCentre 0); in a 36 px circular composer button at (10, 10); in a 36 px high input at (13, 10). Frames are auto-layout (cross axis centre), so icon centre = frame centre; text boxes use the line-height heights above, never the icon box.
- **line height**: Almost all text uses line-height "Auto" = Inter natural height: 10->12, 11->13, 12->15, 13->16, 14->17, 15->18, 16->19, 18->22, 20->24, 22->27, 24->29, 28->34 (box heights read from the nodes). Letter-spacing is 0% everywhere.

## Colour tokens (`Lumen / Color`)

| Token | CSS var | Dark | Light |
|---|---|---|---|
| `surface/window` | `--surface-window` | #191A1B | #F3F3F6 |
| `surface/editor` | `--surface-editor` | #121314 | #FFFFFF |
| `surface/card` | `--surface-card` | #1E1F20 | #FAFAFD |
| `surface/raised` | `--surface-raised` | #252627 | #FFFFFF |
| `surface/input` | `--surface-input` | #191A1B | #FFFFFF |
| `stroke/divider` | `--stroke-divider` | #2A2B2C | #E2E2E5 |
| `stroke/control` | `--stroke-control` | rgba(255, 255, 255, 0.078) | rgba(0, 0, 0, 0.102) |
| `fill/hover` | `--fill-hover` | rgba(255, 255, 255, 0.078) | rgba(0, 0, 0, 0.059) |
| `fill/selected` | `--fill-selected` | rgba(255, 255, 255, 0.129) | rgba(0, 0, 0, 0.11) |
| `text/primary` | `--text-primary` | #E6E6E6 | #202020 |
| `text/secondary` | `--text-secondary` | #BFBFBF | #3B3B3B |
| `text/tertiary` | `--text-tertiary` | #8C8C8C | #606060 |
| `accent/default` | `--accent-default` | #0078D4 | #0069CC |
| `accent/button` | `--accent-button` | #0078D4 | #0069CC |
| `accent/subtle` | `--accent-subtle` | rgba(0, 120, 212, 0.4) | rgba(0, 105, 204, 0.122) |
| `text/on-accent` | `--text-on-accent` | #FFFFFF | #FFFFFF |
| `tag/blue` | `--tag-blue` | #4A9EFF | #0A6ED1 |
| `tag/green` | `--tag-green` | #4CC38A | #1A7F4B |
| `tag/orange` | `--tag-orange` | #F5A524 | #B35C00 |
| `tag/red` | `--tag-red` | #F2555A | #C62828 |
| `tag/purple` | `--tag-purple` | #A77BF3 | #7A4CD9 |
| `tag/yellow` | `--tag-yellow` | #F2C04E | #B8860B |

Hard-coded colours that are not variables: window close hover `#C42B1C`, traffic lights `#FF5F57` `#FEBC2E` `#28C840`, tray plate `#1C1C1C`, Windows toast surface `#2B2B2B`. stroke/control, fill/hover, fill/selected and accent/subtle carry alpha inside the variable; paint opacity on tag/* fills (0.12-0.16 tints) is a property of the paint, not of the variable.

## Other tokens

The file defines only the colour collection "Lumen / Color" (22 variables, modes Dark + Light). Spacing, radius, type, shadow and motion are NOT variables; the values below are observed in the nodes (counts are over the whole file) or transcribed from the Motion page (id 42670).

**Typography observed** (Inter unless noted; letter-spacing 0%):

| Size | Weight | Line height | Use |
|---|---|---|---|
| 10 | 600 | 12px | uppercase label (Semi Bold 10 tracks 0%) |
| 11 | 400 | 13px | captions, secondary meta, kbd, pill (Medium 500) |
| 11 | 600 | 13px | group/section label (UPPERCASE as typed in text, letter-spacing 0%) |
| 12 | 400 | 15px | descriptions, select value, tooltips (also 17/18 px fixed line-height for multi-line) |
| 12 | 500 | 15px | small buttons, segmented options |
| 12 | 600 | 15px | window title |
| 13 | 400 | 16px | body, input text, menu items, nav items (rest); 19 px fixed for paragraphs |
| 13 | 500 | 16px | buttons, selected nav item |
| 13 | 600 | 16px | active tab, toast title |
| 14 | 400 | 17px | composer input |
| 14 | 600 | 17px | popover title |
| 15 | 600 | 18px | section title, brand, palette input |
| 16 | 600 | 19px | dialog title |
| 22 | 600 | 27px | page title |
| 24 | 600 | 29px | board/section title |

**Radius**: 4 (checkbox, kbd, skeleton line, small chips); 5 (kbd in hotkey recorder); 6 (nav item, thread row, menu item, segmented option (settings), tooltip, collapse button); 8 (button, input, select, segmented container (settings), toggle button, toast action); 10 (menu container, toast, source card, banner, permission row, citation hover); 12 (popover, approval card, settings list card, limit banner, empty state card); 14 (dialog, command palette, quick ask bar); 999 (pill, composer, toggle, radio, avatar, favicon, progress track, composer icon buttons)

**Elevation**: menu `0 8px 24px rgba(0,0,0,0.35)` (menus and context menus (9 nodes)); overlay `0 16px 48px rgba(0,0,0,0.45)` (toast, popover, dialog, command palette, upload card (50 nodes)); window `0 18px 50px rgba(0,0,0,0.5)` (app windows and large floating panels (103 nodes)). Shadow colours are plain black rgba, not variables, so they are identical in Light mode.

**Spacing**: Gaps used: 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 24, 26, 32. Control padding: buttons 0/12 (28-34 px high), inputs 0/12, nav items 0/10, menu container 4 (+4 between items), menu item 0/10 (30 px) or 7/8 (30 px), dialog 20, popover 16, card 10-12, list row 11/14, board 40.

**Motion** (Motion page, M1 "Motion tokens" (id 42670), M2 "Animation spec per interaction" (id 42783)):

| Token | Value | Easing | Use |
|---|---|---|---|
| `motion/instant` | 83 ms | none stated | hover fills, pressed states, crossfade of changed text |
| `motion/fast` | 167 ms | decelerate (0, 0, 0, 1) | menus, popovers, hover cards, chips, segmented thumb |
| `motion/normal` | 250 ms | decelerate (0, 0, 0, 1) | panels, sheets, toasts, expanding sections |
| `motion/slow` | 333 ms | point-to-point (0.55, 0.55, 0, 1) | moving things: docking, resizing, progress bars |
| `motion/exit` | 120 ms | accelerate (0.3, 0, 1, 1) | anything leaving the screen |
| `motion/spring` | stiffness 420, damping 34 | spring | voice pill growing and shrinking, mobile sheets |
| `motion/loop-breathe` | 1600 ms | ease-in-out, infinite | agent glow, live dots on tabs |
| `motion/loop-spin` | 800 ms | linear, infinite | spinners (loader-2) |
| `motion/shimmer` | 1200 ms | linear, infinite | skeletons of components still streaming |
| `motion/stagger` | 40 ms per item, max 6 | - | source cards, place cards, list rows |

Reduce motion: No movement: fades only (83 ms), loops stop, glow becomes a static border.

## Components

### button-primary

Page: Web app; source "Group / Button · primary" #18244.

Send button. 32 px high, hug width, padding 0/12, gap 6, centred both axes, radius 8, fill accent/default, label Inter Medium 13 text/on-accent, 16 px icon. Hover uses tag/blue. Pressed is drawn identical to rest. Focus = accent 2 px outside. Disabled opacity 0.4. Loading swaps the icon for loader-2.

Anatomy (base state `rest`):

- Button / Send 78x32; row pad 0/12/0/12 gap 6 center/center; sizing hug/fixed; r8; fill `accent/default` (#0078D4 / #0069CC)
  - Icon / arrow-narrow-up 16x16 @12,8; icon arrow-narrow-up 16px stroke 1.5 center `text/on-accent` (#FFFFFF / #FFFFFF)
  - Send 32x16 @34,8; text Inter 500 13/auto (16px) `text/on-accent` (#FFFFFF / #FFFFFF)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18248 | 78x32 | `accent/default` (#0078D4 / #0069CC) | - | 1 | (base) | `button-primary-rest-dark.png`, `button-primary-rest-light.png` |
| hover | #18256 | 78x32 | `tag/blue` (#4A9EFF / #0A6ED1) | - | 1 | /Button / Send.fill: "accent/default" -> "tag/blue" | `button-primary-hover-dark.png`, `button-primary-hover-light.png` |
| pressed | #18264 | 78x32 | `accent/default` (#0078D4 / #0069CC) | - | 1 | (base) | `button-primary-pressed-dark.png`, `button-primary-pressed-light.png` |
| focus | #18272 | 78x32 | `accent/default` (#0078D4 / #0069CC) | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / Send.stroke: none -> ["accent/default",2,"outside"] | `button-primary-focus-dark.png`, `button-primary-focus-light.png` |
| disabled | #18280 | 78x32 | `accent/default` (#0078D4 / #0069CC) | - | 0.4 | /Button / Send.opacity: none -> 0.4 | `button-primary-disabled-dark.png`, `button-primary-disabled-light.png` |
| loading | #18288 | 78x32 | `accent/default` (#0078D4 / #0069CC) | - | 1 | /Button / Send/Icon / loader-2.icon: ["arrow-narrow-up",16] -> ["loader-2",16] | `button-primary-loading-dark.png`, `button-primary-loading-light.png` |

Icon alignment (base state): arrow-narrow-up 16px at (12,8), centre offset from parent centre dx -19 dy 0, from text centre dy 0

### button-secondary

Page: Web app; source "Group / Button · secondary (outline)" #18293.

Outline button (Share). 32 px, pad 0/12, gap 6, r8, 1 px inside stroke/control, label Inter Medium 13 text/primary, icon text/secondary. Hover fill/hover, pressed fill/selected, focus 2 px accent outside, disabled 0.4.

Anatomy (base state `rest`):

- Button / Share 84x32; row pad 0/12/0/12 gap 6 center/center; sizing hug/fixed; r8; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Icon / share 16x16 @13,8; icon share 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Share 36x16 @35,8; text Inter 500 13/auto (16px) `text/primary` (#E6E6E6 / #202020)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18297 | 84x32 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `button-secondary-rest-dark.png`, `button-secondary-rest-light.png` |
| hover | #18307 | 84x32 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Button / Share.fill: none -> "fill/hover" | `button-secondary-hover-dark.png`, `button-secondary-hover-light.png` |
| pressed | #18317 | 84x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Button / Share.fill: none -> "fill/selected" | `button-secondary-pressed-dark.png`, `button-secondary-pressed-light.png` |
| focus | #18327 | 82x32 | - | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / Share.w: 84 -> 82<br>/Button / Share.stroke: ["stroke/control",1,"inside"] -> ["accent/default",2,"outside"] | `button-secondary-focus-dark.png`, `button-secondary-focus-light.png` |
| disabled | #18337 | 84x32 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 0.4 | /Button / Share.opacity: none -> 0.4 | `button-secondary-disabled-dark.png`, `button-secondary-disabled-light.png` |
| loading | #18347 | 84x32 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Button / Share/Icon / loader-2.icon: ["share",16] -> ["loader-2",16] | `button-secondary-loading-dark.png`, `button-secondary-loading-light.png` |

Icon alignment (base state): share 16px at (13,8), centre offset from parent centre dx -21 dy 0, from text centre dy 0

### button-ghost

Page: Web app; source "Group / Button · ghost" #18352.

Ghost button (Rewrite). No stroke at rest; label text/secondary Medium 13; hover fill/hover, pressed fill/selected, focus 2 px accent outside, disabled 0.4.

Anatomy (base state `rest`):

- Button / Rewrite 94x32; row pad 0/12/0/12 gap 6 center/center; sizing hug/fixed; r8
  - Icon / refresh 16x16 @12,8; icon refresh 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Rewrite 48x16 @34,8; text Inter 500 13/auto (16px) `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18356 | 94x32 | - | - | 1 | (base) | `button-ghost-rest-dark.png`, `button-ghost-rest-light.png` |
| hover | #18363 | 94x32 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | 1 | /Button / Rewrite.fill: none -> "fill/hover" | `button-ghost-hover-dark.png`, `button-ghost-hover-light.png` |
| pressed | #18370 | 94x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | 1 | /Button / Rewrite.fill: none -> "fill/selected" | `button-ghost-pressed-dark.png`, `button-ghost-pressed-light.png` |
| focus | #18377 | 94x32 | - | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / Rewrite.stroke: none -> ["accent/default",2,"outside"] | `button-ghost-focus-dark.png`, `button-ghost-focus-light.png` |
| disabled | #18384 | 94x32 | - | - | 0.4 | /Button / Rewrite.opacity: none -> 0.4 | `button-ghost-disabled-dark.png`, `button-ghost-disabled-light.png` |
| loading | #18391 | 94x32 | - | - | 1 | /Button / Rewrite/Icon / loader-2.icon: ["refresh",16] -> ["loader-2",16] | `button-ghost-loading-dark.png`, `button-ghost-loading-light.png` |

Icon alignment (base state): refresh 16px at (12,8), centre offset from parent centre dx -27 dy 0, from text centre dy 0

### button-danger

Page: Web app; source "Group / Button · danger" #18396.

Ghost danger (Delete). Label tag/red Medium 13, no icon at rest; hover fill/hover; the loading width grows (89 px) because the spinner is added. The confirmed destructive button (dialog) is a separate filled tag/red variant, see pattern modal-dialog.

Anatomy (base state `rest`):

- Button / Delete 67x32; row pad 0/12/0/12 gap 6 center/center; sizing hug/fixed; r8; stroke `tag/red` 1px inside (#F2555A / #C62828)
  - Delete 41x16 @13,8; text Inter 500 13/auto (16px) `tag/red` (#F2555A / #C62828)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18400 | 67x32 | - | `tag/red` 1px inside (#F2555A / #C62828) | 1 | (base) | `button-danger-rest-dark.png`, `button-danger-rest-light.png` |
| hover | #18404 | 67x32 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | `tag/red` 1px inside (#F2555A / #C62828) | 1 | /Button / Delete.fill: none -> "fill/hover" | `button-danger-hover-dark.png`, `button-danger-hover-light.png` |
| pressed | #18408 | 67x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | `tag/red` 1px inside (#F2555A / #C62828) | 1 | /Button / Delete.fill: none -> "fill/selected" | `button-danger-pressed-dark.png`, `button-danger-pressed-light.png` |
| focus | #18412 | 65x32 | - | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / Delete.w: 67 -> 65<br>/Button / Delete.stroke: ["tag/red",1,"inside"] -> ["accent/default",2,"outside"] | `button-danger-focus-dark.png`, `button-danger-focus-light.png` |
| disabled | #18416 | 67x32 | - | `tag/red` 1px inside (#F2555A / #C62828) | 0.4 | /Button / Delete.opacity: none -> 0.4 | `button-danger-disabled-dark.png`, `button-danger-disabled-light.png` |
| loading | #18420 | 89x32 | - | `tag/red` 1px inside (#F2555A / #C62828) | 1 | /Button / Delete.w: 67 -> 89<br>/Button / Delete.children: 1 -> 2 (Icon / loader-2, Delete)<br>/Button / Delete/Icon / loader-2.w: 41 -> 16<br>/Button / Delete/Icon / loader-2.color: "tag/red" -> none<br>/Button / Delete/Icon / loader-2.text: "Delete" -> none<br>/Button / Delete/Icon / loader-2.textStyle: [13,500,null] -> none<br>/Button / Delete/Icon / loader-2.icon: none -> ["loader-2",16] | `button-danger-loading-dark.png`, `button-danger-loading-light.png` |

### icon-button

Page: Web app; source "Group / Icon button (32 · 28 · 24)" #18425.

Only the 32 px size is drawn on the board (the 28 and 24 px sizes named in the title are not drawn). 32x32, r8, 16 px icon at (8,8), no padding. Sizes seen in screens: 40, 36 (composer, r999), 32, 30, 28 (r6/r8), 26 (r8), 24.

Anatomy (base state `rest`):

- Button / dots 32x32; row pad 0/0/0/0 gap 6 center/center; r8
  - Icon / dots 16x16 @8,8; icon dots 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18429 | 32x32 | - | - | 1 | (base) | `icon-button-rest-dark.png`, `icon-button-rest-light.png` |
| hover | #18436 | 32x32 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | 1 | /Button / dots.fill: none -> "fill/hover" | `icon-button-hover-dark.png`, `icon-button-hover-light.png` |
| pressed | #18443 | 32x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | 1 | /Button / dots.fill: none -> "fill/selected" | `icon-button-pressed-dark.png`, `icon-button-pressed-light.png` |
| focus | #18450 | 32x32 | - | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / dots.stroke: none -> ["accent/default",2,"outside"] | `icon-button-focus-dark.png`, `icon-button-focus-light.png` |
| disabled | #18457 | 32x32 | - | - | 0.4 | /Button / dots.opacity: none -> 0.4 | `icon-button-disabled-dark.png`, `icon-button-disabled-light.png` |
| loading | #18464 | 32x32 | - | - | 1 | /Button / loader-2/Icon / loader-2.icon: ["dots",16] -> ["loader-2",16] | `icon-button-loading-dark.png`, `icon-button-loading-light.png` |

Icon alignment (base state): dots 16px at (8,8), centre offset from parent centre dx 0 dy 0

### toggle-button

Page: Web app; source "Group / Toggle button (selected uses fill/selected, radius 8, never a pill)" #18468.

Sources toggle. Same geometry as ghost button; off = no fill, on = fill/selected, radius 8 and never a pill, label text/primary Medium 13. On + focus adds the accent 2 px outside ring.

Anatomy (base state `off`):

- Button / Sources 97x32; row pad 0/12/0/12 gap 6 center/center; sizing hug/fixed; r8
  - Icon / layout-sidebar-right 16x16 @12,8; icon layout-sidebar-right 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Sources 51x16 @34,8; text Inter 500 13/auto (16px) `text/primary` (#E6E6E6 / #202020)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| off | #18472 | 97x32 | - | - | 1 | (base) | `toggle-button-off-dark.png`, `toggle-button-off-light.png` |
| hover | #18479 | 97x32 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | 1 | /Button / Sources.fill: none -> "fill/hover" | `toggle-button-hover-dark.png`, `toggle-button-hover-light.png` |
| on | #18486 | 97x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | 1 | /Button / Sources.fill: none -> "fill/selected" | `toggle-button-on-dark.png`, `toggle-button-on-light.png` |
| on-focus | #18493 | 97x32 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Button / Sources.fill: none -> "fill/selected"<br>/Button / Sources.stroke: none -> ["accent/default",2,"outside"] | `toggle-button-on-focus-dark.png`, `toggle-button-on-focus-light.png` |

Icon alignment (base state): layout-sidebar-right 16px at (12,8), centre offset from parent centre dx -28.5 dy 0, from text centre dy 0

### text-input

Page: Web app; source "Group / Text input" #18499.

36 px high, pad 0/12, gap 8, r8, fill surface/input, 1 px inside stroke/control; hover stroke text/tertiary; focus stroke accent 2 px inside; error stroke tag/red 1 px inside + message Inter 11 tag/red 8 px below; disabled opacity 0.4. Leading 16 px icon at (13,10), text Inter 13 (placeholder text/tertiary, value text/primary).

Anatomy (base state `rest`):

- Frame 240x36; row pad 0/12/0/12 gap 8 min/center; r8; fill `surface/input` (#191A1B / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Icon / mail 16x16 @13,10; icon mail 16px stroke 1.5 center `text/tertiary` (#8C8C8C / #606060)
  - you@example.com 116x16 @37,10; text Inter 400 13/auto (16px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18503 | 240x36 | `surface/input` (#191A1B / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `text-input-rest-dark.png`, `text-input-rest-light.png` |
| hover | #18510 | 240x36 | `surface/input` (#191A1B / #FFFFFF) | `text/tertiary` 1px inside (#8C8C8C / #606060) | 1 | /Frame.stroke: ["stroke/control",1,"inside"] -> ["text/tertiary",1,"inside"] | `text-input-hover-dark.png`, `text-input-hover-light.png` |
| focus | #18517 | 240x36 | `surface/input` (#191A1B / #FFFFFF) | `accent/default` 2px inside (#0078D4 / #0069CC) | 1 | /Frame.stroke: ["stroke/control",1,"inside"] -> ["accent/default",2,"inside"] | `text-input-focus-dark.png`, `text-input-focus-light.png` |
| filled | #18524 | 240x36 | `surface/input` (#191A1B / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/nour@example.com.w: 116 -> 122<br>/Frame/nour@example.com.color: "text/tertiary" -> "text/primary"<br>/Frame/nour@example.com.text: "you@example.com" -> "nour@example.com" | `text-input-filled-dark.png`, `text-input-filled-light.png` |
| error | #18530 | 240x78 | - | - | 1 | /State / Error.h: 36 -> 78<br>/State / Error.fill: "surface/input" -> none<br>/State / Error.stroke: ["stroke/control",1,"inside"] -> none<br>/State / Error.radius: 8 -> none<br>/State / Error.children: 2 -> 3 (Frame, Enter a full email address, Error)<br>/State / Error/Frame.w: 16 -> 240<br>/State / Error/Frame.h: 16 -> 36<br>/State / Error/Frame.fill: none -> "surface/input"<br>/State / Error/Frame.stroke: none -> ["tag/red",1,"inside"]<br>/State / Error/Frame.radius: none -> 8<br>/State / Error/Frame.icon: ["mail",16] -> none<br>/State / Error/Frame.children: 0 -> 2 (Icon / mail, nour@)<br>/State / Error/Enter a full email address.w: 116 -> 131<br>/State / Error/Enter a full email address.h: 16 -> 13<br>/State / Error/Enter a full email address.color: "text/tertiary" -> "tag/red"<br>/State / Error/Enter a full email address.text: "you@example.com" -> "Enter a full email address"<br>/State / Error/Enter a full email address.textStyle: [13,400,null] -> [11,400,null] | `text-input-error-dark.png`, `text-input-error-light.png` |
| disabled | #18539 | 240x36 | `surface/input` (#191A1B / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 0.4 | /Frame.opacity: none -> 0.4 | `text-input-disabled-dark.png`, `text-input-disabled-light.png` |

Icon alignment (base state): mail 16px at (13,10), centre offset from parent centre dx -99 dy 0, from text centre dy 0

### toggle

Page: Web app; source "Group / Toggle · checkbox · radio" #18545.

BOARD geometry: 40x20, r999, knob 12x12 inset 4. Off: 1 px inside stroke text/secondary, knob text/secondary at x=4. On: fill accent/default, knob text/on-accent at x=24. Disabled: on at opacity 0.4. NOTE: the toggle used inside real screens is different: 32x18, padding 2, knob 14x14, off = fill/selected with knob text/secondary at x=2, on = accent/default with knob text/on-accent at x=16 (auto-layout main-axis min/max). See pattern settings-page parts toggle-on and toggle-off. The settings-row version is the one used in the screens (many instances); the 40x20 appears in the Publish popover.

Anatomy (base state `off`):

- Toggle 40x20; r999; stroke `text/secondary` 1px inside (#BFBFBF / #3B3B3B)
  - Frame 12x12 @4,4; r999; fill `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| off | #18549 | 40x20 | - | `text/secondary` 1px inside (#BFBFBF / #3B3B3B) | 1 | (base) | `toggle-off-dark.png`, `toggle-off-light.png` |
| on | #18553 | 40x20 | `accent/default` (#0078D4 / #0069CC) | - | 1 | /Toggle.fill: none -> "accent/default"<br>/Toggle.stroke: ["text/secondary",1,"inside"] -> none<br>/Toggle/Frame.fill: "text/secondary" -> "text/on-accent" | `toggle-on-dark.png`, `toggle-on-light.png` |
| disabled-on | #18557 | 40x20 | `accent/default` (#0078D4 / #0069CC) | - | 0.4 | /Toggle.fill: none -> "accent/default"<br>/Toggle.stroke: ["text/secondary",1,"inside"] -> none<br>/Toggle.opacity: none -> 0.4<br>/Toggle/Frame.fill: "text/secondary" -> "text/on-accent" | `toggle-disabled-on-dark.png`, `toggle-disabled-on-light.png` |

### checkbox

Page: Web app; source "Group / Toggle · checkbox · radio" #18545.

18x18, r4. Off: 1 px inside stroke text/secondary. On: fill accent/default + 14 px check icon at (2,2). Mixed: same fill + 14 px minus icon.

Anatomy (base state `off`):

- Check 18x18; row pad 0/0/0/0 gap 0 center/center; r4; stroke `text/secondary` 1px inside (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| off | #18561 | 18x18 | - | `text/secondary` 1px inside (#BFBFBF / #3B3B3B) | 1 | (base) | `checkbox-off-dark.png`, `checkbox-off-light.png` |
| on | #18564 | 18x18 | `accent/default` (#0078D4 / #0069CC) | - | 1 | /Check.fill: none -> "accent/default"<br>/Check.stroke: ["text/secondary",1,"inside"] -> none<br>/Check.children: 0 -> 1 (Icon / check) | `checkbox-on-dark.png`, `checkbox-on-light.png` |
| mixed | #18569 | 18x18 | `accent/default` (#0078D4 / #0069CC) | - | 1 | /Check.fill: none -> "accent/default"<br>/Check.stroke: ["text/secondary",1,"inside"] -> none<br>/Check.children: 0 -> 1 (Icon / minus) | `checkbox-mixed-dark.png`, `checkbox-mixed-light.png` |

### radio

Page: Web app; source "Group / Toggle · checkbox · radio" #18545.

18x18 circle. Off: 1 px inside stroke text/secondary. On: stroke accent/default 5 px inside (a ring with a hole), no separate dot node. Disabled: on at opacity 0.4.

Anatomy (base state `off`):

- Radio 18x18; r999; stroke `text/secondary` 1px inside (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| off | #18574 | 18x18 | - | `text/secondary` 1px inside (#BFBFBF / #3B3B3B) | 1 | (base) | `radio-off-dark.png`, `radio-off-light.png` |
| on | #18577 | 18x18 | - | `accent/default` 5px inside (#0078D4 / #0069CC) | 1 | /Radio.stroke: ["text/secondary",1,"inside"] -> ["accent/default",5,"inside"] | `radio-on-dark.png`, `radio-on-light.png` |
| disabled-on | #18580 | 18x18 | - | `accent/default` 5px inside (#0078D4 / #0069CC) | 0.4 | /Radio.stroke: ["text/secondary",1,"inside"] -> ["accent/default",5,"inside"]<br>/Radio.opacity: none -> 0.4 | `radio-disabled-on-dark.png`, `radio-disabled-on-light.png` |

### citation-pill

Page: Web app; source "Group / Citation pill" #18582.

18 px high pill, pad 1/6, gap 3, r999, Inter Medium 11 text/secondary, count Inter 11 text/tertiary. Rest fill/selected, hover fill/hover, active fill/selected + 1 px accent inside, focus fill/selected + 2 px accent outside, file variant fill tag/orange at paint opacity 0.3, removed = 1 px tag/red inside, text tag/red strikethrough.

Anatomy (base state `rest`):

- Citation 75x18; row pad 1/6/1/6 gap 3 min/center; sizing hug/fixed; r999; fill `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11))
  - neep.org 47x13 @6,2.5; text Inter 500 11/auto (13px) `text/secondary` (#BFBFBF / #3B3B3B)
  - +1 13x13 @56,2.5; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18586 | 75x18 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | 1 | (base) | `citation-pill-rest-dark.png`, `citation-pill-rest-light.png` |
| hover | #18591 | 75x18 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | 1 | /Citation.fill: "fill/selected" -> "fill/hover" | `citation-pill-hover-dark.png`, `citation-pill-hover-light.png` |
| active | #18596 | 61x18 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | `accent/default` 1px inside (#0078D4 / #0069CC) | 1 | /Citation.w: 75 -> 61<br>/Citation.stroke: none -> ["accent/default",1,"inside"]<br>/Citation.children: 2 -> 1 (neep.org) | `citation-pill-active-dark.png`, `citation-pill-active-light.png` |
| focus | #18600 | 59x18 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | `accent/default` 2px outside (#0078D4 / #0069CC) | 1 | /Citation.w: 75 -> 59<br>/Citation.stroke: none -> ["accent/default",2,"outside"]<br>/Citation.children: 2 -> 1 (neep.org) | `citation-pill-focus-dark.png`, `citation-pill-focus-light.png` |
| file-quote | #18604 | 64x18 | `tag/orange` @0.3 (rgba(245, 165, 36, 0.3) / rgba(179, 92, 0, 0.3)) | - | 1 | /Citation.w: 75 -> 64<br>/Citation.fill: "fill/selected" -> "tag/orange@0.3"<br>/Citation.children: 2 -> 1 (Quote p.2)<br>/Citation/Quote p.2.w: 47 -> 52<br>/Citation/Quote p.2.text: "neep.org" -> "Quote p.2" | `citation-pill-file-quote-dark.png`, `citation-pill-file-quote-light.png` |
| removed | #18608 | 61x18 | - | `tag/red` 1px inside (#F2555A / #C62828) | 1 | /Citation.w: 75 -> 61<br>/Citation.fill: "fill/selected" -> none<br>/Citation.stroke: none -> ["tag/red",1,"inside"]<br>/Citation.children: 2 -> 1 (neep.org)<br>/Citation/neep.org.color: "text/secondary" -> "tag/red"<br>/Citation/neep.org.textStyle: [11,500,null] -> [11,500,"strikethrough"] | `citation-pill-removed-dark.png`, `citation-pill-removed-light.png` |

### status-pill

Page: Web app; source "Group / Status pill" #18611.

17 px high pill, pad 2/8, gap 4, r999, 12 px icon, label Inter Medium 11. Tones: green indexed, blue indexing, orange needs setup, red failed, purple incognito, neutral (fill/selected, text/secondary). Fill is the tone token at paint opacity 0.12-0.16 (see JSON), text and icon use the full token colour.

Anatomy (base state `indexed`):

- Pill 74x17; row pad 2/8/2/8 gap 4 min/center; sizing hug/hug; r999; fill `tag/green` @0.16 (rgba(76, 195, 138, 0.16) / rgba(26, 127, 75, 0.16))
  - Icon / check 12x12 @8,2.5; icon check 12px stroke 1.5 center `tag/green` (#4CC38A / #1A7F4B)
  - Indexed 42x13 @24,2; text Inter 500 11/auto (13px) `tag/green` (#4CC38A / #1A7F4B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| indexed | #18615 | 74x17 | `tag/green` @0.16 (rgba(76, 195, 138, 0.16) / rgba(26, 127, 75, 0.16)) | - | 1 | (base) | `status-pill-indexed-dark.png`, `status-pill-indexed-light.png` |
| indexing | #18621 | 110x17 | `tag/blue` @0.16 (rgba(74, 158, 255, 0.16) / rgba(10, 110, 209, 0.16)) | - | 1 | /Pill.w: 74 -> 110<br>/Pill.fill: "tag/green@0.16" -> "tag/blue@0.16"<br>/Pill/Icon / loader-2.icon: ["check",12] -> ["loader-2",12]<br>/Pill/Indexing · 60%.w: 42 -> 78<br>/Pill/Indexing · 60%.color: "tag/green" -> "tag/blue"<br>/Pill/Indexing · 60%.text: "Indexed" -> "Indexing · 60%" | `status-pill-indexing-dark.png`, `status-pill-indexing-light.png` |
| needs-setup | #18627 | 99x17 | `tag/orange` @0.16 (rgba(245, 165, 36, 0.16) / rgba(179, 92, 0, 0.16)) | - | 1 | /Pill.w: 74 -> 99<br>/Pill.fill: "tag/green@0.16" -> "tag/orange@0.16"<br>/Pill/Icon / alert-triangle.icon: ["check",12] -> ["alert-triangle",12]<br>/Pill/Needs setup.w: 42 -> 67<br>/Pill/Needs setup.color: "tag/green" -> "tag/orange"<br>/Pill/Needs setup.text: "Indexed" -> "Needs setup" | `status-pill-needs-setup-dark.png`, `status-pill-needs-setup-light.png` |
| failed | #18635 | 64x17 | `tag/red` @0.16 (rgba(242, 85, 90, 0.16) / rgba(198, 40, 40, 0.16)) | - | 1 | /Pill.w: 74 -> 64<br>/Pill.fill: "tag/green@0.16" -> "tag/red@0.16"<br>/Pill/Icon / alert-circle.icon: ["check",12] -> ["alert-circle",12]<br>/Pill/Failed.w: 42 -> 32<br>/Pill/Failed.color: "tag/green" -> "tag/red"<br>/Pill/Failed.text: "Indexed" -> "Failed" | `status-pill-failed-dark.png`, `status-pill-failed-light.png` |
| incognito | #18643 | 82x17 | `tag/purple` @0.16 (rgba(167, 123, 243, 0.16) / rgba(122, 76, 217, 0.16)) | - | 1 | /Pill.w: 74 -> 82<br>/Pill.fill: "tag/green@0.16" -> "tag/purple@0.16"<br>/Pill/Icon / eye-off.icon: ["check",12] -> ["eye-off",12]<br>/Pill/Incognito.w: 42 -> 50<br>/Pill/Incognito.color: "tag/green" -> "tag/purple"<br>/Pill/Incognito.text: "Indexed" -> "Incognito" | `status-pill-incognito-dark.png`, `status-pill-incognito-light.png` |
| neutral | #18651 | 55x17 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | 1 | /Pill.w: 74 -> 55<br>/Pill.fill: "tag/green@0.16" -> "fill/selected"<br>/Pill.children: 2 -> 1 (Neutral)<br>/Pill/Neutral.w: 12 -> 39<br>/Pill/Neutral.h: 12 -> 13<br>/Pill/Neutral.color: none -> "text/secondary"<br>/Pill/Neutral.text: none -> "Neutral"<br>/Pill/Neutral.textStyle: none -> [11,500,null]<br>/Pill/Neutral.icon: ["check",12] -> none | `status-pill-neutral-dark.png`, `status-pill-neutral-light.png` |

Icon alignment (base state): check 12px at (8,2.5), centre offset from parent centre dx -23 dy 0, from text centre dy 0

### source-card

Page: Web app; source "Group / Source card" #18654.

220 px wide (fixed), pad 10, gap 8, r10, fill surface/card, 1 px inside stroke/divider. Title Inter Medium 12 with 16 px line-height, 2 lines, favicon 14 px + domain Inter 11 text/tertiary + index. Hover fill/hover; cited-now = fill/hover + 1 px accent stroke; excluded = 1 px tag/red + opacity 0.5.

Anatomy (base state `rest`):

- Frame 220x76; column pad 10/10/10/10 gap 8 min/min; r10; fill `surface/card` (#1E1F20 / #FAFAFD); stroke `stroke/divider` 1px inside (#2A2B2C / #E2E2E5)
  - Cold-climate air-source heat pump field performance 198x32 @11,11; text Inter 500 12/16px `text/primary` (#E6E6E6 / #202020)
  - Frame 198x14 @11,51; row pad 0/0/0/0 gap 6 min/center
    - Favicon 14x14; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/green` (#4CC38A / #1A7F4B)
      - N 7x10 @3.5,2; text Inter 600 8.12/auto (10px) `text/on-accent` (#FFFFFF / #FFFFFF)
    - nrel.gov 42x13 @20,0.5; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)
    - Spacer 117x1 @68,6.5
    - 2 7x13 @191,0.5; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18658 | 220x76 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | (base) | `source-card-rest-dark.png`, `source-card-rest-light.png` |
| hover | #18668 | 220x76 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame.fill: "surface/card" -> "fill/hover" | `source-card-hover-dark.png`, `source-card-hover-light.png` |
| cited-now | #18678 | 220x76 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | `accent/default` 1px inside (#0078D4 / #0069CC) | 1 | /Frame.fill: "surface/card" -> "fill/hover"<br>/Frame.stroke: ["stroke/divider",1,"inside"] -> ["accent/default",1,"inside"] | `source-card-cited-now-dark.png`, `source-card-cited-now-light.png` |
| excluded | #18688 | 220x76 | `surface/card` (#1E1F20 / #FAFAFD) | `tag/red` 1px inside (#F2555A / #C62828) | 0.5 | /Frame.stroke: ["stroke/divider",1,"inside"] -> ["tag/red",1,"inside"]<br>/Frame.opacity: none -> 0.5 | `source-card-excluded-dark.png`, `source-card-excluded-light.png` |

### composer

Page: Web app; source "Group / Composer" #18697.

420x52 (board width), pill r999, pad 0/8, gap 6, fill surface/raised, 1 px inside stroke/control; 36 px round icon buttons at x=9 (plus), x=333 (mic), x=375 (send), vertical 8 px; text Inter 14 (placeholder text/tertiary). Focus and typing: stroke accent 1 px inside; the send button becomes accent/default fill (rest and disabled: fill/hover); streaming: stop button fill text/primary; disabled opacity 0.5.

Anatomy (base state `rest`):

- Frame 420x52; row pad 0/8/0/8 gap 6 min/center; r999; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Button / plus 36x36 @9,8; row pad 0/0/0/0 gap 6 center/center; r999
    - Icon / plus 16x16 @10,10; icon plus 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Ask a follow-up 276x17 @51,17.5; text Inter 400 14/auto (17px) `text/tertiary` (#8C8C8C / #606060)
  - Button / microphone 36x36 @333,8; row pad 0/0/0/0 gap 6 center/center; r999
    - Icon / microphone 16x16 @10,10; icon microphone 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Button / arrow-narrow-up 36x36 @375,8; row pad 0/0/0/0 gap 6 center/center; r999; fill `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059))
    - Icon / arrow-narrow-up 16x16 @10,10; icon arrow-narrow-up 16px stroke 1.5 center `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18701 | 420x52 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `composer-rest-dark.png`, `composer-rest-light.png` |
| focus | #18720 | 420x52 | `surface/raised` (#252627 / #FFFFFF) | `accent/default` 1px inside (#0078D4 / #0069CC) | 1 | /Frame.stroke: ["stroke/control",1,"inside"] -> ["accent/default",1,"inside"]<br>/Frame/Button / arrow-narrow-up.fill: "fill/hover" -> "accent/default" | `composer-focus-dark.png`, `composer-focus-light.png` |
| typing | #18739 | 420x52 | `surface/raised` (#252627 / #FFFFFF) | `accent/default` 1px inside (#0078D4 / #0069CC) | 1 | /Frame.stroke: ["stroke/control",1,"inside"] -> ["accent/default",1,"inside"]<br>/Frame/Is a heat pump worth it/.color: "text/tertiary" -> "text/primary"<br>/Frame/Is a heat pump worth it/.text: "Ask a follow-up" -> "Is a heat pump worth it/"<br>/Frame/Button / arrow-narrow-up.fill: "fill/hover" -> "accent/default" | `composer-typing-dark.png`, `composer-typing-light.png` |
| streaming | #18758 | 420x52 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Button / player-stop.fill: "fill/hover" -> "text/primary"<br>/Frame/Button / player-stop/Icon / player-stop.icon: ["arrow-narrow-up",16] -> ["player-stop",16] | `composer-streaming-dark.png`, `composer-streaming-light.png` |
| disabled | #18775 | 420x52 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 0.5 | /Frame.opacity: none -> 0.5 | `composer-disabled-dark.png`, `composer-disabled-light.png` |

Icon alignment (base state): plus 16px at (10,10), centre offset from parent centre dx 0 dy 0; microphone 16px at (10,10), centre offset from parent centre dx 0 dy 0; arrow-narrow-up 16px at (10,10), centre offset from parent centre dx 0 dy 0

### menu-item

Page: Web app; source "Group / Menu item" #18793.

Item 30 px high inside a menu container (pad 4 around, r10): pad 7/8, gap 10, r6, 16 px icon at (8,7), label Inter 13 text/primary; hover and selected = fill/hover (selected adds a 14 px check at the right); destructive = label tag/red; shortcut = Inter 11 text/tertiary at the right; disabled opacity 0.4. Separator = 1 px stroke/divider with 4 px vertical padding. Menu items in the Files-style composer menus are 32 px high with pad 0/10.

Anatomy (base state `rest`):

- Frame 220x40; column pad 4/4/4/4 gap 0 min/min; sizing fixed/hug; r10; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Frame 210x30 @5,5; row pad 7/8/7/8 gap 10 min/center; r6
    - Icon / pencil 16x16 @8,7; icon pencil 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
    - Rename 168x16 @34,7; text Inter 400 13/auto (16px) `text/primary` (#E6E6E6 / #202020)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| rest | #18797 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `menu-item-rest-dark.png`, `menu-item-rest-light.png` |
| hover | #18805 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Frame.fill: none -> "fill/hover" | `menu-item-hover-dark.png`, `menu-item-hover-light.png` |
| selected | #18813 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Frame.fill: none -> "fill/hover"<br>/Frame/Frame.children: 2 -> 3 (Icon / pencil, Rename, Icon / check)<br>/Frame/Frame/Rename.w: 168 -> 144 | `menu-item-selected-dark.png`, `menu-item-selected-light.png` |
| destructive | #18823 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Frame/Icon / trash.icon: ["pencil",16] -> ["trash",16]<br>/Frame/Frame/Delete.color: "text/primary" -> "tag/red"<br>/Frame/Frame/Delete.text: "Rename" -> "Delete" | `menu-item-destructive-dark.png`, `menu-item-destructive-light.png` |
| with-shortcut | #18834 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Frame.children: 2 -> 3 (Icon / pencil, Rename, F2)<br>/Frame/Frame/Rename.w: 168 -> 144 | `menu-item-with-shortcut-dark.png`, `menu-item-with-shortcut-light.png` |
| disabled | #18843 | 220x40 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame/Frame.opacity: none -> 0.4 | `menu-item-disabled-dark.png`, `menu-item-disabled-light.png` |

Icon alignment (base state): pencil 16px at (8,7), centre offset from parent centre dx -89 dy 0, from text centre dy 0

### tabs-underline

Page: Web app; source "Group / Tabs and segmented control" #18850.

Tab = text + 2 px underline 8 px below the label box (frame gap 8, 26 px high). Active: Inter Semi Bold 13 text/primary + accent/default underline. Inactive: Inter Regular 13 text/tertiary, no underline. Gap between tabs 20.

Anatomy (base state `default`):

- Frame 210x26; row pad 0/0/0/0 gap 20 min/min; sizing hug/hug
  - Frame 49x26; column pad 0/0/0/0 gap 8 min/min
    - Answer 49x16; text Inter 600 13/auto (16px) `text/primary` (#E6E6E6 / #202020)
    - Frame 49x2 @0,24; fill `accent/default` (#0078D4 / #0069CC)
  - Frame 76x26 @69,0; column pad 0/0/0/0 gap 8 min/min
    - Sources · 14 76x16; text Inter 400 13/auto (16px) `text/tertiary` (#8C8C8C / #606060)
    - Frame 76x2 @0,24
  - Frame 45x26 @165,0; column pad 0/0/0/0 gap 8 min/min
    - Images 45x16; text Inter 400 13/auto (16px) `text/tertiary` (#8C8C8C / #606060)
    - Frame 45x2 @0,24

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #18854 | 210x26 | - | - | 1 | (base) | `tabs-underline-default-dark.png`, `tabs-underline-default-light.png` |

### segmented-pill

Page: Web app; source "Group / Tabs and segmented control" #18850.

Composer mode switch: container 34 px high, r999, pad 3, gap 2, 1 px stroke/control, options 26 px high pill, pad 0/8, gap 4, 14 px icon + Inter Medium 12. Selected: fill/selected + text/primary; others text/secondary. Used in the composer only.

Anatomy (base state `default`):

- Frame 292x34; row pad 3/3/3/3 gap 2 min/center; sizing hug/hug; r999; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Button / Search 74x26 @4,4; row pad 0/8/0/8 gap 4 center/center; r999; fill `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11))
    - Icon / search 14x14 @8,6; icon search 14px stroke 1.5 center `text/primary` (#E6E6E6 / #202020)
    - Search 40x15 @26,5.5; text Inter 500 12/auto (15px) `text/primary` (#E6E6E6 / #202020)
  - Button / Research 88x26 @80,4; row pad 0/8/0/8 gap 4 center/center; r999
    - Icon / list-search 14x14 @8,6; icon list-search 14px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
    - Research 54x15 @26,5.5; text Inter 500 12/auto (15px) `text/secondary` (#BFBFBF / #3B3B3B)
  - Button / Deep research 118x26 @170,4; row pad 0/8/0/8 gap 4 center/center; r999
    - Icon / telescope 14x14 @8,6; icon telescope 14px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
    - Deep research 84x15 @26,5.5; text Inter 500 12/auto (15px) `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #18866 | 292x34 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `segmented-pill-default-dark.png`, `segmented-pill-default-light.png` |

Icon alignment (base state): search 14px at (8,6), centre offset from parent centre dx -22 dy 0, from text centre dy 0; list-search 14px at (8,6), centre offset from parent centre dx -29 dy 0, from text centre dy 0; telescope 14px at (8,6), centre offset from parent centre dx -44 dy 0, from text centre dy 0

### segmented-settings

Page: Web app; source "Group / Tabs and segmented control" #18850.

Settings segmented: container 34 px high, r8, pad 3, gap 2, 1 px stroke/control; options 26 px high, r6, pad 0/10, Inter Medium 12; selected fill/selected + text/primary, others text/secondary.

Anatomy (base state `default`):

- Frame 175x34; row pad 3/3/3/3 gap 2 min/min; sizing hug/hug; r8; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Button / Comfortable 92x26 @4,4; row pad 0/10/0/10 gap 6 center/center; r6; fill `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11))
    - Comfortable 72x15 @10,5.5; text Inter 500 12/auto (15px) `text/primary` (#E6E6E6 / #202020)
  - Button / Compact 73x26 @98,4; row pad 0/10/0/10 gap 6 center/center; r6
    - Compact 53x15 @10,5.5; text Inter 500 12/auto (15px) `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #18889 | 175x34 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `segmented-settings-default-dark.png`, `segmented-settings-default-light.png` |

### toast

Page: Web app; source "Group / Toast · banner · tooltip" #18895.

340 px wide, pad 10/12, gap 10, r10, fill surface/raised, 1 px stroke/control, shadow 0 16 48 rgba(0,0,0,.45). 16 px icon, message Inter 13 text/primary, optional 28 px outline action button (r8, Medium 12). Tones differ only by icon (info-circle, trash, circle-check, alert-circle).

Anatomy (base state `neutral`):

- Frame 340x38; row pad 10/12/10/12 gap 10 min/center; sizing fixed/hug; r10; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)); shadow dropShadow 0 16 48 rgba(0, 0, 0, 0.45)
  - Icon / info-circle 16x16 @13,11; icon info-circle 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Link copied as Markdown 288x16 @39,11; text Inter 400 13/auto (16px) `text/primary` (#E6E6E6 / #202020)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| neutral | #18899 | 340x38 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `toast-neutral-dark.png`, `toast-neutral-light.png` |
| with-action | #18907 | 340x50 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame.h: 38 -> 50<br>/Frame.children: 2 -> 3 (Icon / trash, 2 threads moved to Trash, Button / Undo)<br>/Frame/Icon / trash.icon: ["info-circle",16] -> ["trash",16]<br>/Frame/2 threads moved to Trash.w: 288 -> 221<br>/Frame/2 threads moved to Trash.text: "Link copied as Markdown" -> "2 threads moved to Trash" | `toast-with-action-dark.png`, `toast-with-action-light.png` |
| success | #18919 | 340x50 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame.h: 38 -> 50<br>/Frame.children: 2 -> 3 (Icon / circle-check, Export ready, Button / Download)<br>/Frame/Icon / circle-check.icon: ["info-circle",16] -> ["circle-check",16]<br>/Frame/Export ready.w: 288 -> 194<br>/Frame/Export ready.text: "Link copied as Markdown" -> "Export ready" | `toast-success-dark.png`, `toast-success-light.png` |
| error | #18928 | 340x50 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | /Frame.h: 38 -> 50<br>/Frame.children: 2 -> 3 (Icon / alert-circle, Couldn’t save memory, Button / Retry)<br>/Frame/Icon / alert-circle.icon: ["info-circle",16] -> ["alert-circle",16]<br>/Frame/Couldn’t save memory.w: 288 -> 221<br>/Frame/Couldn’t save memory.text: "Link copied as Markdown" -> "Couldn’t save memory" | `toast-error-dark.png`, `toast-error-light.png` |

Icon alignment (base state): info-circle 16px at (13,11), centre offset from parent centre dx -149 dy 0, from text centre dy 0

### tooltip

Page: Web app; source "Group / Toast · banner · tooltip" #18895.

Pad 5/8, gap 6, r6, fill surface/raised, 1 px stroke/control; text Inter 12 text/primary; shortcut kbd 16 px high r4 Inter 10 text/tertiary.

Anatomy (base state `default`):

- Frame 141x28; row pad 5/8/5/8 gap 6 min/center; sizing hug/hug; r6; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Open sources 79x15 @9,6.5; text Inter 400 12/auto (15px) `text/primary` (#E6E6E6 / #202020)
  - Frame 38x16 @94,6; row pad 1/5/1/5 gap 0 min/min; r4; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Ctrl J 26x12 @6,2; text Inter 400 10/auto (12px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #18938 | 141x28 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `tooltip-default-dark.png`, `tooltip-default-light.png` |

### loading

Page: Web app; source "Group / Loading" #18943.

Skeleton: 10 px lines r4 fill/hover (widths 300/276/180, gap 8). Spinner + label: loader-2 16 px + Inter 13 text/primary, gap 8 (spin 800 ms linear). Progress bar: 4 px track r999 fill/hover, fill accent/default (width animates with motion/slow). Streaming caret: 2 px wide accent/default bar as high as the text line (18 px at 15 px text).

Anatomy (base state `skeleton-answer`):

- Frame 300x46; column pad 0/0/0/0 gap 8 min/min; sizing fixed/hug
  - Frame 300x10; r4; fill `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059))
  - Frame 276x10 @0,18; r4; fill `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059))
  - Frame 180x10 @0,36; r4; fill `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059))

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| skeleton-answer | #18947 | 300x46 | - | - | 1 | (base) | `loading-skeleton-answer-dark.png`, `loading-skeleton-answer-light.png` |
| spinner-label | #18953 | 144x16 | - | - | 1 | /Frame.w: 300 -> 144<br>/Frame.h: 46 -> 16<br>/Frame.children: 3 -> 2 (Icon / loader-2, Reading 14 sources)<br>/Frame/Icon / loader-2.w: 300 -> 16<br>/Frame/Icon / loader-2.h: 10 -> 16<br>/Frame/Icon / loader-2.fill: "fill/hover" -> none<br>/Frame/Icon / loader-2.radius: 4 -> none<br>/Frame/Icon / loader-2.icon: none -> ["loader-2",16]<br>/Frame/Reading 14 sources.w: 276 -> 120<br>/Frame/Reading 14 sources.h: 10 -> 16<br>/Frame/Reading 14 sources.fill: "fill/hover" -> none<br>/Frame/Reading 14 sources.radius: 4 -> none<br>/Frame/Reading 14 sources.color: none -> "text/primary"<br>/Frame/Reading 14 sources.text: none -> "Reading 14 sources"<br>/Frame/Reading 14 sources.textStyle: none -> [13,400,null] | `loading-spinner-label-dark.png`, `loading-spinner-label-light.png` |
| progress-bar | #18959 | 240x4 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | 1 | /Frame.w: 300 -> 240<br>/Frame.h: 46 -> 4<br>/Frame.fill: none -> "fill/hover"<br>/Frame.radius: none -> 999<br>/Frame.children: 3 -> 1 (Frame)<br>/Frame/Frame.w: 300 -> 140<br>/Frame/Frame.h: 10 -> 4<br>/Frame/Frame.fill: "fill/hover" -> "accent/default"<br>/Frame/Frame.radius: 4 -> 999 | `loading-progress-bar-dark.png`, `loading-progress-bar-light.png` |
| streaming-caret | #18963 | 81x18 | - | - | 1 | /Frame.w: 300 -> 81<br>/Frame.h: 46 -> 18<br>/Frame.children: 3 -> 2 (so bills usu, Frame)<br>/Frame/so bills usu.w: 300 -> 79<br>/Frame/so bills usu.h: 10 -> 18<br>/Frame/so bills usu.fill: "fill/hover" -> none<br>/Frame/so bills usu.radius: 4 -> none<br>/Frame/so bills usu.color: none -> "text/primary"<br>/Frame/so bills usu.text: none -> "so bills usu"<br>/Frame/so bills usu.textStyle: none -> [15,400,null]<br>/Frame/Frame.w: 276 -> 2<br>/Frame/Frame.h: 10 -> 18<br>/Frame/Frame.fill: "fill/hover" -> "accent/default"<br>/Frame/Frame.radius: 4 -> none | `loading-streaming-caret-dark.png`, `loading-streaming-caret-light.png` |

### avatar

Page: Web app; source "Group / Avatar · keyboard key · favicon" #18967.

Circle with a tag colour fill and the initial in Inter Semi Bold at 42% of the diameter (13.44 at 32, 11.76 at 28, 9.24 at 22), text/on-accent, centred.

Anatomy (base state `sizes-32-28-22`):

- Frame 102x32; row pad 0/0/0/0 gap 10 min/center; sizing hug/hug
  - Frame 32x32; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/purple` (#A77BF3 / #7A4CD9)
    - N 10x16 @11,8; text Inter 600 13.44/auto (16px) `text/on-accent` (#FFFFFF / #FFFFFF)
  - Frame 28x28 @42,2; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/blue` (#4A9EFF / #0A6ED1)
    - S 8x14 @10,7; text Inter 600 11.76/auto (14px) `text/on-accent` (#FFFFFF / #FFFFFF)
  - Frame 22x22 @80,5; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/orange` (#F5A524 / #B35C00)
    - L 6x11 @8,5.5; text Inter 600 9.24/auto (11px) `text/on-accent` (#FFFFFF / #FFFFFF)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| sizes-32-28-22 | #18971 | 102x32 | - | - | 1 | (base) | `avatar-sizes-32-28-22-dark.png`, `avatar-sizes-32-28-22-light.png` |

### keyboard-key

Page: Web app; source "Group / Avatar · keyboard key · favicon" #18967.

Pad 2/6, r4, 1 px stroke/control, no fill, Inter 11 text/tertiary, 4 px between keys, 19 px high.

Anatomy (base state `default`):

- Frame 101x19; row pad 0/0/0/0 gap 4 min/min; sizing hug/hug
  - Frame 33x19; row pad 2/6/2/6 gap 0 min/min; r4; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Ctrl 19x13 @7,3; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)
  - Frame 39x19 @37,0; row pad 2/6/2/6 gap 0 min/min; r4; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Shift 25x13 @7,3; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)
  - Frame 21x19 @80,0; row pad 2/6/2/6 gap 0 min/min; r4; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - P 7x13 @7,3; text Inter 400 11/auto (13px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #18980 | 101x19 | - | - | 1 | (base) | `keyboard-key-default-dark.png`, `keyboard-key-default-light.png` |

### favicon

Page: Web app; source "Group / Avatar · keyboard key · favicon" #18967.

Circle with a tag colour fill and the initial in Inter Semi Bold at 58% of the diameter (8.12 at 14, 9.28 at 16, 13.92 at 24), text/on-accent.

Anatomy (base state `sizes-14-16-24`):

- Frame 70x24; row pad 0/0/0/0 gap 8 min/center; sizing hug/hug
  - Favicon 14x14 @0,5; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/green` (#4CC38A / #1A7F4B)
    - N 7x10 @3.5,2; text Inter 600 8.12/auto (10px) `text/on-accent` (#FFFFFF / #FFFFFF)
  - Favicon 16x16 @22,4; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/blue` (#4A9EFF / #0A6ED1)
    - E 6x11 @5,2.5; text Inter 600 9.28/auto (11px) `text/on-accent` (#FFFFFF / #FFFFFF)
  - Favicon 24x24 @46,0; row pad 0/0/0/0 gap 0 center/center; r999; fill `tag/red` (#F2555A / #C62828)
    - r 6x17 @9,3.5; text Inter 600 13.92/auto (17px) `text/on-accent` (#FFFFFF / #FFFFFF)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| sizes-14-16-24 | #18989 | 70x24 | - | - | 1 | (base) | `favicon-sizes-14-16-24-dark.png`, `favicon-sizes-14-16-24-light.png` |

### title-bar

Page: Desktop app; source "TITLE BAR" #37784.

Windows: 40 px high, pad 0/12, gap 6, fill surface/window, 1 px inside stroke/divider; logo 18 px r5.22 accent/default with 12 px sparkles; title Inter Semi Bold 12; search field 240x30 r10 surface/raised; window buttons 46x40 with 12 px icons, hover fill/hover, close hover fill #C42B1C (hard-coded, not a variable), unfocused opacity 0.5. macOS: pad 0/14, three 12 px traffic lights (#FF5F57, #FEBC2E, #28C840, hard-coded) at x=15/35/55.

Anatomy (base state `windows-focused`):

- Frame 640x40; row pad 0/12/0/12 gap 6 min/center; fill `surface/window` (#191A1B / #F3F3F6); stroke `stroke/divider` 1px inside (#2A2B2C / #E2E2E5)
  - Logo 18x18 @13,11; row pad 0/0/0/0 gap 0 center/center; r5.22; fill `accent/default` (#0078D4 / #0069CC)
    - Icon / sparkles 12x12 @3,3; icon sparkles 12px stroke 1.5 center `text/on-accent` (#FFFFFF / #FFFFFF)
  - Lumen 40x15 @37,12.5; text Inter 600 12/auto (15px) `text/primary` (#E6E6E6 / #202020)
  - Spacer 74x1 @83,19.5
  - Frame 240x30 @163,5; row pad 0/10/0/10 gap 8 min/center; r10; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Icon / search 14x14 @11,8; icon search 14px stroke 1.5 center `text/tertiary` (#8C8C8C / #606060)
    - Search 40x15 @33,7.5; text Inter 400 12/auto (15px) `text/tertiary` (#8C8C8C / #606060)
  - Spacer 74x1 @409,19.5
  - Frame 46x40 @489,0; row pad 0/0/0/0 gap 0 center/center
    - Icon / minus 12x12 @17,14; icon minus 12px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Frame 46x40 @541,0; row pad 0/0/0/0 gap 0 center/center
    - Frame 10x10 @18,15; r1; stroke `text/secondary` 1px inside (#BFBFBF / #3B3B3B)
  - Frame 46x40 @593,0; row pad 0/0/0/0 gap 0 center/center
    - Icon / x 12x12 @17,14; icon x 12px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| windows-focused | #37788 | 640x40 | `surface/window` (#191A1B / #F3F3F6) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | (base) | `title-bar-windows-focused-dark.png`, `title-bar-windows-focused-light.png` |
| window-buttons | #37811 | 220x40 | - | - | 1 | /Frame.w: 640 -> 220<br>/Frame.fill: "surface/window" -> none<br>/Frame.stroke: ["stroke/divider",1,"inside"] -> none<br>/Frame.children: 8 -> 4 (Frame, Frame, Frame, Frame)<br>/Frame/Frame.w: 18 -> 46<br>/Frame/Frame.h: 18 -> 40<br>/Frame/Frame.fill: "accent/default" -> none<br>/Frame/Frame.radius: 5.22 -> none<br>/Frame/Frame/Icon / minus.icon: ["sparkles",12] -> ["minus",12]<br>/Frame/Frame.w: 40 -> 46<br>/Frame/Frame.h: 15 -> 40<br>/Frame/Frame.fill: none -> "fill/hover"<br>/Frame/Frame.color: "text/primary" -> none<br>/Frame/Frame.text: "Lumen" -> none<br>/Frame/Frame.textStyle: [12,600,null] -> none<br>/Frame/Frame.children: 0 -> 1 (Icon / minus)<br>/Frame/Frame.w: 74 -> 46<br>/Frame/Frame.h: 1 -> 40<br>/Frame/Frame.fill: none -> "#C42B1C"<br>/Frame/Frame.children: 0 -> 1 (Icon / x)<br>/Frame/Frame.w: 240 -> 46<br>/Frame/Frame.h: 30 -> 40<br>/Frame/Frame.fill: "surface/raised" -> none<br>/Frame/Frame.stroke: ["stroke/control",1,"inside"] -> none<br>/Frame/Frame.opacity: none -> 0.5<br>/Frame/Frame.radius: 10 -> none<br>/Frame/Frame.children: 2 -> 1 (Icon / x)<br>/Frame/Frame/Icon / x.w: 14 -> 12<br>/Frame/Frame/Icon / x.h: 14 -> 12<br>/Frame/Frame/Icon / x.icon: ["search",14] -> ["x",12] | `title-bar-window-buttons-dark.png`, `title-bar-window-buttons-light.png` |
| macos | #37828 | 420x40 | `surface/window` (#191A1B / #F3F3F6) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame.w: 640 -> 420<br>/Frame.children: 8 -> 5 (Frame, Frame, Frame, Frame, Lumen)<br>/Frame/Frame.w: 18 -> 12<br>/Frame/Frame.h: 18 -> 12<br>/Frame/Frame.fill: "accent/default" -> "#FF5F57"<br>/Frame/Frame.radius: 5.22 -> 999<br>/Frame/Frame.children: 1 -> 0 ()<br>/Frame/Frame.w: 40 -> 12<br>/Frame/Frame.h: 15 -> 12<br>/Frame/Frame.fill: none -> "#FEBC2E"<br>/Frame/Frame.radius: none -> 999<br>/Frame/Frame.color: "text/primary" -> none<br>/Frame/Frame.text: "Lumen" -> none<br>/Frame/Frame.textStyle: [12,600,null] -> none<br>/Frame/Frame.w: 74 -> 12<br>/Frame/Frame.h: 1 -> 12<br>/Frame/Frame.fill: none -> "#28C840"<br>/Frame/Frame.radius: none -> 999<br>/Frame/Frame.w: 240 -> 20<br>/Frame/Frame.h: 30 -> 1<br>/Frame/Frame.fill: "surface/raised" -> none<br>/Frame/Frame.stroke: ["stroke/control",1,"inside"] -> none<br>/Frame/Frame.radius: 10 -> none<br>/Frame/Frame.children: 2 -> 0 ()<br>/Frame/Lumen.w: 74 -> 40<br>/Frame/Lumen.h: 1 -> 15<br>/Frame/Lumen.color: none -> "text/primary"<br>/Frame/Lumen.text: none -> "Lumen"<br>/Frame/Lumen.textStyle: none -> [12,600,null] | `title-bar-macos-dark.png`, `title-bar-macos-light.png` |

Icon alignment (base state): sparkles 12px at (3,3), centre offset from parent centre dx 0 dy 0; search 14px at (11,8), centre offset from parent centre dx -102 dy 0, from text centre dy 0; minus 12px at (17,14), centre offset from parent centre dx 0 dy 0; x 12px at (17,14), centre offset from parent centre dx 0 dy 0

### tray-icon

Page: Desktop app; source "TRAY ICON STATES" #37835.

40x40 plate r6 fill #1C1C1C (hard-coded), 18 px logo centred; status dot 8x8 absolute at (26,6): accent (working), tag/orange (needs you), tag/red (listening); paused = logo at opacity 0.4.

Anatomy (base state `normal`):

- Frame 40x40; row pad 0/0/0/0 gap 0 center/center; r6; fill #1C1C1C
  - Logo 18x18 @11,11; row pad 0/0/0/0 gap 0 center/center; r5.22; fill `accent/default` (#0078D4 / #0069CC)
    - Icon / sparkles 12x12 @3,3; icon sparkles 12px stroke 1.5 center `text/on-accent` (#FFFFFF / #FFFFFF)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| normal | #37839 | 40x40 | #1C1C1C | - | 1 | (base) | `tray-icon-normal-dark.png`, `tray-icon-normal-light.png` |
| working | #37845 | 40x40 | #1C1C1C | - | 1 | /Frame.children: 1 -> 2 (Logo, Frame) | `tray-icon-working-dark.png`, `tray-icon-working-light.png` |
| needs-you | #37852 | 40x40 | #1C1C1C | - | 1 | /Frame.children: 1 -> 2 (Logo, Frame) | `tray-icon-needs-you-dark.png`, `tray-icon-needs-you-light.png` |
| paused | #37859 | 40x40 | #1C1C1C | - | 1 | /Frame/Logo.opacity: none -> 0.4 | `tray-icon-paused-dark.png`, `tray-icon-paused-light.png` |
| listening-mic | #37865 | 40x40 | #1C1C1C | - | 1 | /Frame.children: 1 -> 2 (Logo, Frame) | `tray-icon-listening-mic-dark.png`, `tray-icon-listening-mic-light.png` |

Icon alignment (base state): sparkles 12px at (3,3), centre offset from parent centre dx 0 dy 0

### hotkey-recorder

Page: Desktop app; source "HOTKEY RECORDER" #37871.

Set: 33 px high r8, pad 4/6, gap 4, 1 px stroke/control, kbd chips 23 px high r5 pad 3/8 fill surface/input with 1 px stroke/control and Inter Medium 12. Recording: 27 px high, 2 px accent inside stroke, text accent Inter 12 "Press keys...". Conflict: 1 px tag/orange stroke + message Inter 11 tag/orange.

Anatomy (base state `set`):

- Frame 106x33; row pad 4/6/4/6 gap 4 min/center; sizing hug/hug; r8; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Kbd 34x23 @7,5; row pad 3/8/3/8 gap 0 min/min; r5; fill `surface/input` (#191A1B / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Alt 16x15 @9,4; text Inter 500 12/auto (15px) `text/primary` (#E6E6E6 / #202020)
  - Kbd 54x23 @45,5; row pad 3/8/3/8 gap 0 min/min; r5; fill `surface/input` (#191A1B / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
    - Space 36x15 @9,4; text Inter 500 12/auto (15px) `text/primary` (#E6E6E6 / #202020)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| set | #37875 | 106x33 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `hotkey-recorder-set-dark.png`, `hotkey-recorder-set-light.png` |
| recording | #37882 | 87x27 | - | `accent/default` 2px inside (#0078D4 / #0069CC) | 1 | /Frame.w: 106 -> 87<br>/Frame.h: 33 -> 27<br>/Frame.stroke: ["stroke/control",1,"inside"] -> ["accent/default",2,"inside"]<br>/Frame.children: 2 -> 1 (Press keys…)<br>/Frame/Press keys….w: 34 -> 71<br>/Frame/Press keys….h: 23 -> 15<br>/Frame/Press keys….fill: "surface/input" -> none<br>/Frame/Press keys….stroke: ["stroke/control",1,"inside"] -> none<br>/Frame/Press keys….radius: 5 -> none<br>/Frame/Press keys….color: none -> "accent/default"<br>/Frame/Press keys….text: none -> "Press keys…"<br>/Frame/Press keys….textStyle: none -> [12,400,null]<br>/Frame/Press keys….children: 1 -> 0 () | `hotkey-recorder-recording-dark.png`, `hotkey-recorder-recording-light.png` |
| conflict | #37886 | 106x33 | - | `tag/orange` 1px inside (#F5A524 / #B35C00) | 1 | /Frame.stroke: ["stroke/control",1,"inside"] -> ["tag/orange",1,"inside"] | `hotkey-recorder-conflict-dark.png`, `hotkey-recorder-conflict-light.png` |

### permission-row

Page: Desktop app; source "PERMISSION ROW (MACOS)" #37893.

420 wide, pad 10/12, gap 10, r10, fill surface/card, 1 px stroke/divider; 16 px icon, label Inter 13, right status pill (Allowed green with check, Relaunch needed orange) or a 26 px outline button "Open System Settings" (Medium 11).

Anatomy (base state `allowed`):

- Frame 420x39; row pad 10/12/10/12 gap 10 min/center; sizing fixed/hug; r10; fill `surface/card` (#1E1F20 / #FAFAFD); stroke `stroke/divider` 1px inside (#2A2B2C / #E2E2E5)
  - Icon / scan 16x16 @13,11.5; icon scan 16px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
  - Screen Recording 284x16 @39,11.5; text Inter 400 13/auto (16px) `text/primary` (#E6E6E6 / #202020)
  - Pill 74x17 @333,11; row pad 2/8/2/8 gap 4 min/center; r999; fill `tag/green` @0.16 (rgba(76, 195, 138, 0.16) / rgba(26, 127, 75, 0.16))
    - Icon / check 12x12 @8,2.5; icon check 12px stroke 1.5 center `tag/green` (#4CC38A / #1A7F4B)
    - Allowed 42x13 @24,2; text Inter 500 11/auto (13px) `tag/green` (#4CC38A / #1A7F4B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| allowed | #37897 | 420x39 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | (base) | `permission-row-allowed-dark.png`, `permission-row-allowed-light.png` |
| relaunch-needed | #37911 | 420x39 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame/Screen Recording.w: 284 -> 250<br>/Frame/Pill.w: 74 -> 108<br>/Frame/Pill.fill: "tag/green@0.16" -> "tag/orange@0.16"<br>/Frame/Pill.children: 2 -> 1 (Relaunch needed)<br>/Frame/Pill/Relaunch needed.w: 12 -> 92<br>/Frame/Pill/Relaunch needed.h: 12 -> 13<br>/Frame/Pill/Relaunch needed.color: none -> "tag/orange"<br>/Frame/Pill/Relaunch needed.text: none -> "Relaunch needed"<br>/Frame/Pill/Relaunch needed.textStyle: none -> [11,500,null]<br>/Frame/Pill/Relaunch needed.icon: ["check",12] -> none | `permission-row-relaunch-needed-dark.png`, `permission-row-relaunch-needed-light.png` |
| not-allowed | #37923 | 420x48 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame.h: 39 -> 48<br>/Frame/Screen Recording.w: 284 -> 214<br>/Frame/Button / Open System Settings.w: 74 -> 144<br>/Frame/Button / Open System Settings.h: 17 -> 26<br>/Frame/Button / Open System Settings.fill: "tag/green@0.16" -> none<br>/Frame/Button / Open System Settings.stroke: none -> ["stroke/control",1,"inside"]<br>/Frame/Button / Open System Settings.radius: 999 -> 8<br>/Frame/Button / Open System Settings.children: 2 -> 1 (Open System Settings)<br>/Frame/Button / Open System Settings/Open System Settings.w: 12 -> 118<br>/Frame/Button / Open System Settings/Open System Settings.h: 12 -> 13<br>/Frame/Button / Open System Settings/Open System Settings.color: none -> "text/primary"<br>/Frame/Button / Open System Settings/Open System Settings.text: none -> "Open System Settings"<br>/Frame/Button / Open System Settings/Open System Settings.textStyle: none -> [11,500,null]<br>/Frame/Button / Open System Settings/Open System Settings.icon: ["check",12] -> none | `permission-row-not-allowed-dark.png`, `permission-row-not-allowed-light.png` |

Icon alignment (base state): scan 16px at (13,11.5), centre offset from parent centre dx -189 dy 0, from text centre dy 0; check 12px at (8,2.5), centre offset from parent centre dx -23 dy 0, from text centre dy 0

### approval-card

Page: Desktop app; source "APPROVAL CARD (MCP TOOL · FILE CHANGE · AGENT STEP)" #37934.

Needs OK: 420 wide, pad 12, gap 8, r12, fill surface/card, 1 px tag/orange stroke; header = 14 px plug icon + JetBrains Mono 12 tool name + orange pill; actions row 28 px buttons: Deny (tag/red text), Allow in this chat (outline), Allow once (accent fill). Resolved rows are 33 px high r10 with 1 px stroke/divider, 14 px icon and Inter 12 text/secondary.

Anatomy (base state `needs-ok`):

- Frame 420x79; column pad 12/12/12/12 gap 8 min/min; sizing fixed/hug; r12; fill `surface/card` (#1E1F20 / #FAFAFD); stroke `tag/orange` 1px inside (#F5A524 / #B35C00)
  - Frame 394x17 @13,13; row pad 0/0/0/0 gap 8 min/center
    - Icon / plug 14x14 @0,1.5; icon plug 14px stroke 1.5 center `text/secondary` (#BFBFBF / #3B3B3B)
    - GitHub · create_issue 269x16 @22,0.5; text JetBrains Mono 400 12/auto (16px) `text/primary` (#E6E6E6 / #202020)
    - Pill 95x17 @299,0; row pad 2/8/2/8 gap 4 min/center; r999; fill `tag/orange` @0.16 (rgba(245, 165, 36, 0.16) / rgba(179, 92, 0, 0.16))
      - Needs your OK 79x13 @8,2; text Inter 500 11/auto (13px) `tag/orange` (#F5A524 / #B35C00)
  - Frame 394x28 @13,38; row pad 0/0/0/0 gap 6 min/min
    - Button / Deny 51x28; row pad 0/12/0/12 gap 6 center/center; r8
      - Deny 27x13 @12,7.5; text Inter 500 11/auto (13px) `tag/red` (#F2555A / #C62828)
    - Spacer 127x1 @57,0
    - Button / Allow in this chat 116x28 @190,0; row pad 0/12/0/12 gap 6 center/center; r8; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
      - Allow in this chat 90x13 @13,7.5; text Inter 500 11/auto (13px) `text/primary` (#E6E6E6 / #202020)
    - Button / Allow once 82x28 @312,0; row pad 0/12/0/12 gap 6 center/center; r8; fill `accent/default` (#0078D4 / #0069CC)
      - Allow once 58x13 @12,7.5; text Inter 500 11/auto (13px) `text/on-accent` (#FFFFFF / #FFFFFF)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| needs-ok | #37938 | 420x79 | `surface/card` (#1E1F20 / #FAFAFD) | `tag/orange` 1px inside (#F5A524 / #B35C00) | 1 | (base) | `approval-card-needs-ok-dark.png`, `approval-card-needs-ok-light.png` |
| allowed-automatically | #37958 | 420x33 | - | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame.h: 79 -> 33<br>/Frame.fill: "surface/card" -> none<br>/Frame.stroke: ["tag/orange",1,"inside"] -> ["stroke/divider",1,"inside"]<br>/Frame.radius: 12 -> 10<br>/Frame/Icon / circle-check.w: 394 -> 14<br>/Frame/Icon / circle-check.h: 17 -> 14<br>/Frame/Icon / circle-check.icon: none -> ["circle-check",14]<br>/Frame/Icon / circle-check.children: 3 -> 0 ()<br>/Frame/GitHub · search_issues (read).w: 394 -> 372<br>/Frame/GitHub · search_issues (read).h: 28 -> 15<br>/Frame/GitHub · search_issues (read).color: none -> "text/secondary"<br>/Frame/GitHub · search_issues (read).text: none -> "GitHub · search_issues (read)"<br>/Frame/GitHub · search_issues (read).textStyle: none -> [12,400,null]<br>/Frame/GitHub · search_issues (read).children: 4 -> 0 () | `approval-card-allowed-automatically-dark.png`, `approval-card-allowed-automatically-light.png` |
| denied | #37965 | 420x33 | - | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | 1 | /Frame.h: 79 -> 33<br>/Frame.fill: "surface/card" -> none<br>/Frame.stroke: ["tag/orange",1,"inside"] -> ["stroke/divider",1,"inside"]<br>/Frame.radius: 12 -> 10<br>/Frame/Icon / ban.w: 394 -> 14<br>/Frame/Icon / ban.h: 17 -> 14<br>/Frame/Icon / ban.icon: none -> ["ban",14]<br>/Frame/Icon / ban.children: 3 -> 0 ()<br>/Frame/You denied GitHub · delete_branch.w: 394 -> 372<br>/Frame/You denied GitHub · delete_branch.h: 28 -> 15<br>/Frame/You denied GitHub · delete_branch.color: none -> "text/secondary"<br>/Frame/You denied GitHub · delete_branch.text: none -> "You denied GitHub · delete_branch"<br>/Frame/You denied GitHub · delete_branch.textStyle: none -> [12,400,null]<br>/Frame/You denied GitHub · delete_branch.children: 4 -> 0 () | `approval-card-denied-dark.png`, `approval-card-denied-light.png` |

Icon alignment (base state): plug 14px at (0,1.5), centre offset from parent centre dx -190 dy 0, from text centre dy 0

### windows-toast

Page: Desktop app; source "WINDOWS TOAST" #37971.

364 wide, pad 14, gap 6, r8, fill #2B2B2B (hard-coded Windows surface) + 1 px stroke/control; app row 16 px logo r4.64 + Inter 11 text/secondary; title Inter Semi Bold 13; body Inter 12 text/secondary.

Anatomy (base state `default`):

- Frame 364x89; column pad 14/14/14/14 gap 6 min/min; sizing fixed/hug; r8; fill #2B2B2B; stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Frame 59x16 @15,15; row pad 0/0/0/0 gap 8 min/center
    - Logo 16x16; row pad 0/0/0/0 gap 0 center/center; r4.64; fill `accent/default` (#0078D4 / #0069CC)
      - Icon / sparkles 11x11 @2.5,2.5; icon sparkles 11px stroke 1.5 center `text/on-accent` (#FFFFFF / #FFFFFF)
    - Lumen 35x13 @24,1.5; text Inter 400 11/auto (13px) `text/secondary` (#BFBFBF / #3B3B3B)
  - Needs you: File new invoices 181x16 @15,37; text Inter 600 13/auto (16px) `text/primary` (#E6E6E6 / #202020)
  - “scan-0918.pdf” has no vendor. Click to answer. 271x15 @15,59; text Inter 400 12/auto (15px) `text/secondary` (#BFBFBF / #3B3B3B)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| default | #37975 | 364x89 | #2B2B2B | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `windows-toast-default-dark.png`, `windows-toast-default-light.png` |

Icon alignment (base state): sparkles 11px at (2.5,2.5), centre offset from parent centre dx 0 dy 0

### floating-surface

Page: Desktop app; source "FLOATING SURFACES" #37984.

Quick ask bar 520x56 r14 pad 0/12/0/16 gap 10, surface/raised, 1 px stroke/control, 22 px logo, Inter 16 placeholder. Companion pill 23 px high r999, 1 px accent stroke, 12 px spinner + Inter 11. Working pill 40 px high r999, pad 6/6/6/12, 1 px tag/purple stroke, spinner 16 px, Inter Medium 12, Stop button 26 px r8 tag/red fill.

Anatomy (base state `quick-ask-bar`):

- Frame 520x56; row pad 0/12/0/16 gap 10 min/center; r14; fill `surface/raised` (#252627 / #FFFFFF); stroke `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102))
  - Logo 22x22 @17,17; row pad 0/0/0/0 gap 0 center/center; r6.38; fill `accent/default` (#0078D4 / #0069CC)
    - Icon / sparkles 15x15 @3.5,3.5; icon sparkles 15px stroke 1.5 center `text/on-accent` (#FFFFFF / #FFFFFF)
  - Ask anything… 458x19 @49,18.5; text Inter 400 16/auto (19px) `text/tertiary` (#8C8C8C / #606060)

| State | Node | Size | Fill | Stroke | Opacity | Differences from base | Images |
|---|---|---|---|---|---|---|---|
| quick-ask-bar | #37988 | 520x56 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | 1 | (base) | `floating-surface-quick-ask-bar-dark.png`, `floating-surface-quick-ask-bar-light.png` |
| companion-pill | #37995 | 78x23 | `surface/raised` (#252627 / #FFFFFF) | `accent/default` 1px inside (#0078D4 / #0069CC) | 1 | /Frame.w: 520 -> 78<br>/Frame.h: 56 -> 23<br>/Frame.stroke: ["stroke/control",1,"inside"] -> ["accent/default",1,"inside"]<br>/Frame.radius: 14 -> 999<br>/Frame/Icon / loader-2.w: 22 -> 12<br>/Frame/Icon / loader-2.h: 22 -> 12<br>/Frame/Icon / loader-2.fill: "accent/default" -> none<br>/Frame/Icon / loader-2.radius: 6.38 -> none<br>/Frame/Icon / loader-2.icon: none -> ["loader-2",12]<br>/Frame/Icon / loader-2.children: 1 -> 0 ()<br>/Frame/Working.w: 458 -> 43<br>/Frame/Working.h: 19 -> 13<br>/Frame/Working.color: "text/tertiary" -> "text/primary"<br>/Frame/Working.text: "Ask anything…" -> "Working"<br>/Frame/Working.textStyle: [16,400,null] -> [11,400,null] | `floating-surface-companion-pill-dark.png`, `floating-surface-companion-pill-light.png` |
| working-pill | #38001 | 278x40 | `surface/raised` (#252627 / #FFFFFF) | `tag/purple` 1px inside (#A77BF3 / #7A4CD9) | 1 | /Frame.w: 520 -> 278<br>/Frame.h: 56 -> 40<br>/Frame.stroke: ["stroke/control",1,"inside"] -> ["tag/purple",1,"inside"]<br>/Frame.radius: 14 -> 999<br>/Frame.children: 2 -> 3 (Icon / loader-2, Lumen is working · step 5 of 12, Button / Stop)<br>/Frame/Icon / loader-2.w: 22 -> 16<br>/Frame/Icon / loader-2.h: 22 -> 16<br>/Frame/Icon / loader-2.fill: "accent/default" -> none<br>/Frame/Icon / loader-2.radius: 6.38 -> none<br>/Frame/Icon / loader-2.icon: none -> ["loader-2",16]<br>/Frame/Icon / loader-2.children: 1 -> 0 ()<br>/Frame/Lumen is working · step 5 of 12.w: 458 -> 177<br>/Frame/Lumen is working · step 5 of 12.h: 19 -> 15<br>/Frame/Lumen is working · step 5 of 12.color: "text/tertiary" -> "text/primary"<br>/Frame/Lumen is working · step 5 of 12.text: "Ask anything…" -> "Lumen is working · step 5 of 12"<br>/Frame/Lumen is working · step 5 of 12.textStyle: [16,400,null] -> [12,500,null] | `floating-surface-working-pill-dark.png`, `floating-surface-working-pill-light.png` |

Icon alignment (base state): sparkles 15px at (3.5,3.5), centre offset from parent centre dx 0 dy 0

## Patterns

### app-shell-sidebar

Sidebar 248 px wide, full height, pad 12, gap 2, no own fill (screen frame is surface/window); the main content is a "Main card" at x=248, inset 8 px top/right/bottom, r12, fill surface/editor, 1 px inside stroke/divider. Brand row 44 px (logo 24 r7, name Inter Semi Bold 15, collapse button 28 r6). New thread button 36 px r8 fill surface/input + 1 px stroke/control, kbd at right. Nav item 32 px high, pad 0/10, gap 10, r6, 18 px icon at (10,7), label Inter 13: selected = fill/selected + text/primary + Medium 500, rest = text/secondary Regular. Section header "Recent" 35 px (pad 16/10/6/10, Inter Semi Bold 11 text/tertiary) with "View all" Inter 11 at right. Thread row 30 px high r6 pad 0/10, Inter 13 text/secondary, single line. Profile row 42 px at the bottom: avatar 28, name/plan two lines, settings button 28. Counter badge: 15 px high pill, pad 1/6, fill accent/subtle, Inter Medium 11 text/primary.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| brand | #3703 | Web app | 224x44 | row pad 4/4/12/6 gap 8 min/center | - | - | - | - | `pattern-app-shell-sidebar-brand-dark.png` |
| new-thread | #3714 | Web app | 224x36 | row pad 0/8/0/10 gap 8 min/center | 8 | `surface/input` (#191A1B / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | - | `pattern-app-shell-sidebar-new-thread-dark.png` |
| nav-item-selected | #3723 | Web app | 224x32 | row pad 0/10/0/10 gap 10 min/center | 6 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | - | `pattern-app-shell-sidebar-nav-item-selected-dark.png` |
| nav-item-rest | #3729 | Web app | 224x32 | row pad 0/10/0/10 gap 10 min/center | 6 | - | - | - | `pattern-app-shell-sidebar-nav-item-rest-dark.png` |
| nav-item-with-badge | #3754 | Web app | 224x32 | row pad 0/10/0/10 gap 10 min/center | 6 | - | - | - | `pattern-app-shell-sidebar-nav-item-with-badge-dark.png` |
| section-label | #3766 | Web app | 224x35 | row pad 16/10/6/10 gap 0 min/center | - | - | - | - | `pattern-app-shell-sidebar-section-label-dark.png` |
| thread-row | #3770 | Web app | 224x30 | row pad 0/10/0/10 gap 0 min/center | 6 | - | - | - | `pattern-app-shell-sidebar-thread-row-dark.png` |
| profile | #3785 | Web app | 224x42 | row pad 8/6/4/8 gap 10 min/center | - | - | - | - | `pattern-app-shell-sidebar-profile-dark.png` |
| badge | #3760 | Web app | 19x15 | row pad 1/6/1/6 gap 0 min/min | 999 | `accent/subtle` (rgba(0, 120, 212, 0.4) / rgba(0, 105, 204, 0.122)) | - | - | `pattern-app-shell-sidebar-badge-dark.png` |

### settings-page

Settings nav 248 px (same shell as sidebar): header row 36 px = back arrow 16 px + title Inter Semi Bold 15; items 32 px high with 18 px icons, selected fill/selected. Content column 840 px wide, gap 26: page title Inter Semi Bold 22; section = title Inter Semi Bold 15 + description Inter 12 text/tertiary (gap 2) then a list card (gap 10 below the header): r12, fill surface/card, 1 px stroke/divider, rows separated by a top-only 1 px stroke/divider (stroke sides [1,0,0,0]). Row: pad 11/14, gap 10, vertically centred, label Inter Medium 13 text/primary + description Inter 12 text/tertiary (gap 2) on the left (fill width), control on the right (select 32 px, toggle 32x18, segmented, dots button 26). Simple row (no icon): pad 10/16, label+description 2 px apart.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| nav | #12096 | Web app | 248x900 | column pad 12/12/12/12 gap 2 min/min | - | - | - | - | `pattern-settings-page-nav-dark.png` |
| nav-item-selected | #12108 | Web app | 224x32 | row pad 0/10/0/10 gap 10 min/center | 6 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | - | `pattern-settings-page-nav-item-selected-dark.png` |
| content | #12352 | Web app | 840x1230 | column pad 0/0/0/0 gap 26 min/min | - | - | - | - | `pattern-settings-page-content-dark.png` |
| section | #12354 | Web app | 840x265 | column pad 0/0/0/0 gap 10 min/min | - | - | - | - | `pattern-settings-page-section-dark.png` |
| card-list | #12358 | Web app | 840x220 | column pad 0/0/0/0 gap 0 min/min | 12 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | - | `pattern-settings-page-card-list-dark.png` |
| row-with-toggle | #12359 | Web app | 838x55 | row pad 11/14/11/14 gap 10 min/center | - | - | - | - | `pattern-settings-page-row-with-toggle-dark.png` |
| row-divider | #12389 | Web app | 838x56 | row pad 11/14/11/14 gap 10 min/center | - | - | `stroke/divider` 1px inside sides TRBL [1,0,0,0] (#2A2B2C / #E2E2E5) | - | `pattern-settings-page-row-divider-dark.png` |
| toggle-on | #12382 | Web app | 32x18 | row pad 2/2/2/2 gap 0 max/center | 999 | `accent/default` (#0078D4 / #0069CC) | - | - | `pattern-settings-page-toggle-on-dark.png` |
| toggle-off | #12431 | Web app | 32x18 | row pad 2/2/2/2 gap 0 min/center | 999 | `fill/selected` (rgba(255, 255, 255, 0.129) / rgba(0, 0, 0, 0.11)) | - | - | `pattern-settings-page-toggle-off-dark.png` |
| row-label-desc-select | #3348 | Web app | 638x56 | row pad 10/16/10/16 gap 12 min/center | - | - | `stroke/divider` 1px inside sides TRBL [1,0,0,0] (#2A2B2C / #E2E2E5) | - | `pattern-settings-page-row-label-desc-select-dark.png` |
| row-segmented | #12221 | Web app | 758x60 | row pad 12/16/12/16 gap 12 min/center | - | - | `stroke/divider` 1px inside sides TRBL [1,0,0,0] (#2A2B2C / #E2E2E5) | - | `pattern-settings-page-row-segmented-dark.png` |
| row-accent | #12211 | Web app | 758x46 | row pad 12/16/12/16 gap 12 min/center | - | - | - | - | `pattern-settings-page-row-accent-dark.png` |

### select-dropdown

Select = 32 px high, hug width, pad 0/10, gap 6, r8, fill surface/input, 1 px stroke/control, value Inter 12 text/primary, chevron-down 14 px at the right; compact variant 30 px high (no fill). No separate select-menu node exists in the file: the open menu is the standard Menu (container r10, pad 4, fill surface/raised, shadow 0 16 48 .45; rows 30 px, pad 7/8, gap 10, r6; selected row fill/hover + check 14 px right).

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| select | #12018 | Web app | 83x32 | row pad 0/10/0/10 gap 6 min/center | 8 | `surface/input` (#191A1B / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | - | `pattern-select-dropdown-select-dark.png` |
| select-small | #17132 | Web app | 90x30 | row pad 0/10/0/10 gap 6 min/center | 8 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | - | `pattern-select-dropdown-select-small-dark.png` |
| menu | #17184 | Web app | 200x109 | column pad 4/4/4/4 gap 0 min/min | 10 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-select-dropdown-menu-dark.png` |

### popover

Popover r12, pad 16, gap 12, fill surface/raised, 1 px stroke/control, shadow 0 16 48 .45; title Inter Semi Bold 14; fields 32 px high r8 fill surface/input; switch rows 20 px high; footer buttons 32 px right aligned.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| publish-popover | #11887 | Web app | 320x235 | column pad 16/16/16/16 gap 12 min/min | 12 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-popover-publish-popover-dark.png` |
| update-popover | #30240 | Desktop app | 380x191 | column pad 16/16/16/16 gap 10 min/min | 12 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 18 50 rgba(0, 0, 0, 0.5) | `pattern-popover-update-popover-dark.png` |

### context-menu

Menu container r10, pad 4, gap 4 (or 0), fill surface/raised, 1 px stroke/control, shadow 0 8 24 .35; items 32 px (pad 0/10, gap 10, r6, 16 px icon at x=10, label Inter 13, shortcut Inter 12 text/tertiary); group label Inter Semi Bold 11 text/tertiary (pad 6/10/2/10); separator 1 px stroke/divider inside 6 px horizontal padding. Windows classic variant is a separate native-style frame.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| menu-attach | #9434 | Web app | 240x293 | column pad 4/4/4/4 gap 4 min/min | 10 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 8 24 rgba(0, 0, 0, 0.35) | `pattern-context-menu-menu-attach-dark.png` |
| menu-row-actions | #16456 | Web app | 260x229 | column pad 4/4/4/4 gap 0 min/min | 10 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-context-menu-menu-row-actions-dark.png` |
| submenu | #16506 | Web app | 240x263 | column pad 4/4/4/4 gap 0 min/min | 10 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-context-menu-submenu-dark.png` |
| windows-classic | #23702 | Desktop app | 270x231 | column pad 4/4/4/4 gap 0 min/min | 8 | #2B2B2B | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 18 50 rgba(0, 0, 0, 0.5) | `pattern-context-menu-windows-classic-dark.png` |

### modal-dialog

Dialog r14, pad 20, gap 14, fill surface/raised, 1 px stroke/control, shadow 0 16 48 .45; header row 28 px: title Inter Semi Bold 16 + spacer + 28 px close icon button (16 px x); body Inter 13 text/secondary with 19 px line-height; footer right-aligned, gap 8, buttons 34 px high pad 0/12 r8: Cancel (text/secondary Medium 13, no fill) + primary (accent fill) or destructive (tag/red fill, text-on-accent). Widths 440 (confirm), 500-620 (forms). No scrim node is drawn in the file.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| confirm | #16730 | Web app | 440x170 | column pad 20/20/20/20 gap 14 min/min | 14 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-modal-dialog-confirm-dark.png` |
| form | #19299 | Web app | 560x555 | column pad 20/20/20/20 gap 14 min/min | 14 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-modal-dialog-form-dark.png` |
| share | #11243 | Web app | 520x604 | column pad 20/20/20/20 gap 14 min/min | 14 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-modal-dialog-share-dark.png` |

### command-palette

Palette 640 wide, r14, fill surface/raised, 1 px stroke/control, shadow 0 16 48 .45. Search row 52 px: pad 0/16, 18 px search icon, Inter 15 text, Esc kbd. Results area pad 6 with a top 1 px stroke/divider; group label row 25 px (pad 8/10/4/10, Inter Semi Bold 11 UPPERCASE as typed, text/tertiary); result row r8 pad 8/10 gap 10: 46 px high with two lines (title Inter 13 + subtitle Inter 12, gap 1) or 32 px single line; active row fill/selected, return icon 14 px at right; shortcut Inter 11 text/tertiary. Footer with key hints.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| palette | #17470 | Web app | 640x469 | column pad 0/0/0/0 gap 0 min/min | 14 | `surface/raised` (#252627 / #FFFFFF) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | dropShadow 0 16 48 rgba(0, 0, 0, 0.45) | `pattern-command-palette-palette-dark.png` |
| row-component | #32054 | Desktop app | 818x39 | row pad 10/16/10/16 gap 12 min/center | - | - | - | - | `pattern-command-palette-row-component-dark.png` |

### browser-side-panel

Assistant panel 380 wide (Browser & devices D1, height of the web view area) and vertical tab sidebar 268 wide / collapsed rail 56 wide (Browser layouts V1/V2); Assistant panel = card r12, fill surface/editor, 1 px stroke/divider; header 48 px (pad 0/8/0/16, gap 4), thread column pad 4/16/16/16 gap 14, composer r12 pad 10/10/8/12 fill surface/raised with 1 px stroke/control, inset 12 px. Tab sidebar: pad 10, gap 4, per-space tint = a tag colour rectangle at opacity 0.06 behind the list; pinned/tab item 32 px high r8 pad 0/8 gap 10; tab group = r10 pad 6/4 gap 2 with tag fill at paint opacity 0.14; collapsed rail 56 wide, pad 10/8, 36x36 r8 items.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| assistant-panel | #41442 | Browser & devices | 380x806 | - | 12 | `surface/editor` (#121314 / #FFFFFF) | `stroke/divider` 1px inside (#2A2B2C / #E2E2E5) | - | `pattern-browser-side-panel-assistant-panel-dark.png` |
| tab-sidebar | #43171 | Browser layouts | 268x900 | column pad 10/10/10/10 gap 4 min/min | - | - | - | - | `pattern-browser-side-panel-tab-sidebar-dark.png` |
| tab-rail-collapsed | #43428 | Browser layouts | 56x900 | column pad 10/8/10/8 gap 4 min/center | - | - | - | - | `pattern-browser-side-panel-tab-rail-collapsed-dark.png` |

### empty-state

Card r12, fill surface/editor, 1 px stroke/divider, pad 40/24, content centred with gap 12: 52 px r14 icon tile (fill surface/card, 1 px stroke/divider, 26 px icon), title Inter Semi Bold 16 text/primary, body Inter 13 text/secondary 19 px line-height max 440 wide, buttons 32 px (primary accent + outline) gap 8.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| library | #15910 | Web app | 680x321 | column pad 0/0/0/0 gap 8 min/min | - | - | - | - | `pattern-empty-state-library-dark.png` |
| search-no-results | #15929 | Web app | 680x321 | column pad 0/0/0/0 gap 8 min/min | - | - | - | - | `pattern-empty-state-search-no-results-dark.png` |
| spaces | #15943 | Web app | 680x321 | column pad 0/0/0/0 gap 8 min/min | - | - | - | - | `pattern-empty-state-spaces-dark.png` |
| tasks | #15958 | Web app | 680x321 | column pad 0/0/0/0 gap 8 min/min | - | - | - | - | `pattern-empty-state-tasks-dark.png` |

### banner

Banner r10, pad 10/14, gap 10, 16 px icon, text Inter 13/12 text/primary, 28 px action buttons (outline or accent). Fill = tone token at paint opacity 0.12 (orange warning, accent info); limit banner r12 pad 12/16 uses tag/red tint, title Inter Semi Bold 13 + body Inter 12 text/secondary.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| warning | #8957 | Web app | 720x48 | row pad 10/14/10/14 gap 10 min/center | 10 | `tag/orange` @0.12 (rgba(245, 165, 36, 0.12) / rgba(179, 92, 0, 0.12)) | - | - | `pattern-banner-warning-dark.png` |
| limit-error | #16234 | Web app | 720x57 | row pad 12/16/12/16 gap 12 min/center | 12 | `tag/red` @0.1 (rgba(242, 85, 90, 0.1) / rgba(198, 40, 40, 0.1)) | - | - | `pattern-banner-limit-error-dark.png` |
| import-info | #33289 | Desktop app | 820x48 | row pad 10/14/10/14 gap 10 min/center | 10 | `accent/default` @0.12 (rgba(0, 120, 212, 0.12) / rgba(0, 105, 204, 0.12)) | - | - | `pattern-banner-import-info-dark.png` |

### progress

Track 4 px (3 px in upload card) r999 fill/hover, fill accent/default; determinate width. Stepper-like list progress uses the same 4 px bar. Slider: NOT in the file.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| bar-4px | #3668 | Web app | 290x4 | - | 999 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | - | `pattern-progress-bar-4px-dark.png` |
| track-in-card | #4982 | Web app | 718x16 | row pad 0/14/12/14 gap 0 min/min | - | - | - | - | `pattern-progress-track-in-card-dark.png` |
| bar-3px | #10083 | Web app | 208x3 | - | - | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | - | `pattern-progress-bar-3px-dark.png` |

### stepper

Web onboarding stepper: row of steps gap 8, each = 20 px marker + label, connectors 24x1 stroke/divider. Desktop wizard stepper 52 px high, pad 0/28: marker 20 px circle (active accent fill + white number Inter Semi Bold 11; inactive 1 px stroke/control + text/tertiary number), label Inter Medium 12 (active text/primary) or Inter 12 text/tertiary, connectors 28x1 stroke/divider.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| web-onboarding | #3211 | Web app | 442x20 | row pad 0/0/0/0 gap 8 min/center | - | - | - | - | `pattern-stepper-web-onboarding-dark.png` |
| desktop-window | #21268 | Desktop app | 960x52 | row pad 0/28/0/28 gap 8 min/center | - | - | - | - | `pattern-stepper-desktop-window-dark.png` |

### list-row

Thread row: pad 12, gap 12, top-only 1 px stroke/divider, 16 px leading icon at y=13, title Inter Medium 14 text/primary + preview Inter 12 text/tertiary (gap 3), date Inter 12 text/tertiary at right. Result row 55 px. Settings row: see settings-page.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| thread-row | #5879 | Web app | 760x60 | row pad 12/12/12/12 gap 12 min/min | - | - | `stroke/divider` 1px inside sides TRBL [1,0,0,0] (#2A2B2C / #E2E2E5) | - | `pattern-list-row-thread-row-dark.png` |
| result-row | #6184 | Web app | 1128x55 | row pad 10/8/10/8 gap 12 min/center | 8 | `fill/hover` (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.059)) | - | - | `pattern-list-row-result-row-dark.png` |
| settings-row | #12359 | Web app | 838x55 | row pad 11/14/11/14 gap 10 min/center | - | - | - | - | `pattern-list-row-settings-row-dark.png` |

### badge-counter-chip

Counter badge 15 px high pill pad 1/6 fill accent/subtle Inter Medium 11. Chip 21 px high pill pad 3/8 gap 5 with 1 px stroke/control, 12 px icon, Inter 11 text/secondary. Scrollbar and slider: NOT in the file.

| Part | Node | Page | Size | Layout | Radius | Fill | Stroke | Shadow | Image |
|---|---|---|---|---|---|---|---|---|---|
| badge | #3760 | Web app | 19x15 | row pad 1/6/1/6 gap 0 min/min | 999 | `accent/subtle` (rgba(0, 120, 212, 0.4) / rgba(0, 105, 204, 0.122)) | - | - | `pattern-badge-counter-chip-badge-dark.png` |
| chip | #5039 | Web app | 191x21 | row pad 3/8/3/8 gap 5 min/center | 999 | - | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | - | `pattern-badge-counter-chip-chip-dark.png` |
| attachment-chip | #8063 | Web app | 182x43 | row pad 6/10/6/10 gap 8 min/center | 8 | `surface/card` (#1E1F20 / #FAFAFD) | `stroke/control` 1px inside (rgba(255, 255, 255, 0.078) / rgba(0, 0, 0, 0.102)) | - | `pattern-badge-counter-chip-attachment-chip-dark.png` |

## Not found in the file

- **Slider** (range input): no node. **Scrollbar**: no node (no thumb/track styling). Both must be designed from the tokens (track `fill/hover`, thumb `fill/selected`) and flagged as not from Lumen.
- **Modal scrim/backdrop**: not drawn; dialogs are shown on the plain screen.
- **Select menu** (open dropdown): no dedicated node; use the Menu pattern.
- **Icon button 28 px and 24 px** on the components board: named in the title, not drawn (32 px only).
- **Hover/pressed/focus states** for nav items, thread rows, select, segmented options, tabs, toggle, checkbox and radio: not drawn; only rest/selected (nav) are. Use fill/hover and fill/selected per the global rules.
- **Separate light-mode component board**: absent (see note at top).
- **Shadow, spacing, radius, type tokens as variables**: absent; observed values only.

## Caveats

- `stroke.sides_trbl` is the per-side stroke mask as stored in the file ([1,0,0,0]); the order top, right, bottom, left is inferred from the rows (the divider sits above each row, none above the first).
- The web board's "pressed" primary button is identical to rest in the file; the hover colour of the primary button is `tag/blue`, which is not an alpha overlay.
- The board header says the focus ring has a 2 px offset; the drawn nodes are a 2 px outside stroke with no gap. The JSON follows the drawn nodes.
- Two toggle geometries exist (board 40x20 with a 12 px knob, screens 32x18 with a 14 px knob); screens use the second one.
