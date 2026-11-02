# Lockix design system for Speak Kit (light only)

Extracted 2026-11-02 from Lockix (`apps/desktop/src/renderer/styles.css`, `components/ui/*.tsx`, `components/shell/*`, `windows/*`, `docs/desktop.md`, `docs/figma-map.md`, the Latch figcraft file). The code is the source of truth. Speak Kit has no dark mode and Lockix is light-only, so only light values are recorded; Lockix's parked dark block is not copied.

Files:

- `docs/lockix-design-system/tokens.json` - every token, radius, shadow, motion value and size, machine readable.
- `docs/lockix-design-system/lockix-components.css` - framework-free CSS for every component below, using the Speak Kit variable names of section 3. Apply it as `.lm` root + the existing `lm-*` roles; new roles are `lx-*`.
- `docs/lockix-design-system/frames/` - 17 Latch design frames (`NN-*.png`) and `frames/app/` - 7 renders of the real Lockix app (light).
- `code/packages/ui/tests/fixtures/lockix/` - `spec-page.html` (all components on one page), `expected-metrics.json`, and four Lockix smoke layouts (`[path, x, y, w, h]` boxes of the real app) to assert geometry against.

## 1. The look in one paragraph

A `#F0F0F0` window. Panels, cards and popovers are white, with no stroke on panels and a faint 1 px-ring-plus-soft-shadow elsewhere. The primary action is a near-black button (`#201E25`), not blue; the same black fills an on switch, a checked checkbox and the radio dot. White buttons carry a `#E5E5E5` stroke and a 1 px shadow. Blue (`#0069CC`) is for the focus ring, links, selection and progress only. Radius follows container level (16 dialog, 14 panel/tray, 12 floating card, 10 card/menu, 8 control, 6 chip, 5 checkbox). Status colour is three tokens per hue: text (`tag-*`), dot (`dot-*`), tinted fill (`chip-*`). Disabled controls use opaque greys, never opacity. Motion is springs expressed as `linear()` easings; state changes are 167 ms fades. Font Inter Variable, 13 px base; icons Tabler outline, stroke 1.5.

## 2. Decisions

### Button mapping

| Speak Kit (`lm-btn--`) | Lockix | Look (light) |
| --- | --- | --- |
| `primary` (blue fill) | `default`, "cta" | `#201E25` fill, `#FAFAFA` text, `shadow-cta`, no border; hover fill 90%, pressed 80% |
| `secondary` (outline) | `outline` | white, 1 px `#E5E5E5`, `shadow-control`, text `#171717`, icon `#475467`; hover `#F7F8FA`, pressed `#F0F0F0` |
| `ghost` | `ghost` | transparent, text `#475467`; hover `rgb(0 0 0/.04)` + text `#1B2230`; pressed `rgb(0 0 0/.07)` |
| `danger` (red outline) | `destructive` | 10% red tint fill, text `#C62828`; hover 20% |
| `danger-solid` | none in Lockix | use `danger` (tinted); a solid red button stays out of the system. Where a destructive confirm needs weight, put it in the dialog footer as `danger` size `xl` |
| `toggle` (selected state) | `toggle` / segmented item | selected = white card, 1 px `#E5E5E5`, `shadow-control` on the `#F0F0F0` track |
| `icon` | `icon`, `icon-sm`, `icon-xs` | 36 / 28 / 24 square |

Sizes: Lockix default is 36 (Speak Kit 32), `sm` 28, `xs` 24, `xl` 40 for dialog and sheet footers. Recommendation: adopt 36 / 28 / 24 / 40 everywhere; dense in-page surfaces (dock, bubble, gutter) use `sm` 28 or `xs` 24. `lg` (34) disappears (Lockix `lg` equals default).

Focus ring stays blue: `--accent-default`, 1 px inside the element (the "always-present transparent outline" rule in the CSS). A 2 px ring with 2 px offset, as Speak Kit has today, is replaced by this. On a dark host page the in-page dock keeps its own contrast handling (not part of this system).

### Filled accent that is not a button

| Place in Speak Kit | Today | Becomes (Lockix terms) |
| --- | --- | --- |
| Play button in the dock / `.rd-play` (player.css) | accent fill | primary action: `cta` black circle/pill with `text-on-cta` glyph, `shadow-cta` (it is the one primary action of the dock) |
| Edge launcher tab (`.sk-rail i`, `.sk-vrail i`) | accent fill | `surface-raised` white tab with `stroke-control` and `shadow-popover`; its icon `icon`. When reading it shows the `dot-green` 8 px dot. Not blue |
| Paragraph gutter play button | accent tint/fill | ghost `icon-xs` (24 px, radius 6); hover `fill-hover`; while reading `cta` fill |
| Scrubber / progress (`lm-progress__bar`, `lm-slider__range`) | accent | stays `accent-default` on a `track` (`#F0F0F0`, 4 px bar, slider track 5 px); slider thumb white with `stroke-field` ring |
| Chips / `lm-badge` accent, `.rd-bar__tile`, `.lib-resume__tile`, `lm-avatar` accent | accent fill or `accent-subtle` | neutral `chip-gray` + `text-secondary` pill, or a `lx-tile` (`surface-well`, `icon-quiet`); status chips use `chip-*` + `tag-*` |
| `lm-toggle[aria-checked=true]`, `lm-check` checked / indeterminate, radio | accent | `cta` black |
| Selected tab underline (`.lm-tab[aria-selected]::after`) | accent | `accent-default` stays (selection) |
| Selected voice/row (`.sk-voice.is-selected`, `.sk-vrow.is-selected`), library "selected" | `accent-subtle` | `fill-selected` `#F0F0F0` plus `font-weight 500`; keyboard focus the 1 px blue ring |
| Reader text selection (`::selection`), link colour, drop zone dashed border, focus rings | accent / accent-subtle | unchanged: `accent-default` and `accent-subtle` |
| Active step marker, `lm-caret`, loading icon | accent | `cta` for done markers; caret and spinner `accent-default` |
| Reading highlight (sentence, word) | yellow | unchanged, product specific (`hlSent #FFF1C2`, `hlWord #FFD24D` stay) |

### Kept and removed

- Kept: reading highlight yellow, the reader "paper" theme (`--paper-*`, `--rd-*`), `tag-purple` (#7A4CD9) and `tag-yellow` (#B8860B) (Lockix has no purple or yellow; keep them for tags that need them), `accent-subtle` as selection tint.
- Removed (for the agents that touch the files): every dark token and `[data-theme=dark]` block, `prefers-color-scheme: dark` blocks, the 12 `--lm-shadow-window` dark drop shadows, the theme switch. `tokens.ts` `dark` object. None of it is replaced.

## 3. Token mapping

Speak Kit names are the current ones (`lumen.css`, `tokens.ts`; `docs/design-system.md` aliases in the second column; `designs/gen/kit.ts` keys in the third). "new" = a token Speak Kit lacks; keep the name given.

| Speak Kit token | Alias / kit.ts key | Current light | Lockix light replacement |
| --- | --- | --- | --- |
| `surface-window` | `--bg` / `bg` | #F3F3F6 | `#F0F0F0` |
| `surface-editor` | page canvas / `editor` | #FFFFFF | `#FFFFFF` (Lockix `panel`) |
| `surface-card` | `--surface` / `surface` | #FAFAFD | `#FFFFFF` (Lockix `card`) |
| `surface-raised` | `--surface2` / `surface2`, `raised` | #FFFFFF (hover rows #EBEBEE) | `#FFFFFF` for buttons, popovers, menus. Hover rows use `fill-hover`, not a raised grey |
| `surface-input` | `input` | #FFFFFF | `#FFFFFF` |
| `stroke-divider` | `--border` / `border` | #E2E2E5 | `#EBEBEB` |
| `stroke-control` | `--stroke-control` / `control` | rgba(0,0,0,.102) | `#E5E5E5` (opaque; button, text field, menu, popover stroke) |
| `fill-hover` | `hover` | rgba(0,0,0,.059) | `rgb(0 0 0 / .04)` |
| `fill-selected` | `selected` | rgba(0,0,0,.11) | `#F0F0F0` for a selected row on white; pressed uses new `fill-pressed` |
| `text-primary` | `--text` / `text` | #202020 | `#1B2230` |
| `text-secondary` | `--text2` | #3B3B3B | `#475467` |
| `text-tertiary` | `--text3` | #606060 | `#5F6A7D` |
| `text-on-accent` | `accentText` | #FFFFFF | `#FFFFFF` (also text on blue progress only) |
| `accent-default` | `--accent` / `accent` | #0069CC | `#0069CC` (identical): focus ring, links, selection, progress |
| `accent-button` | | #0069CC | removed: primary button is `cta` |
| `accent-subtle` | `accentSoft` | rgba(0,105,204,.122) | unchanged, selection tint only |
| `tag-green` / `ok` | `ok` | #1A7F4B | `#17693D` |
| `tag-orange` / `warn` | `warn` | #B35C00 | `#9A5200` |
| `tag-red` / `err` | `err` | #C62828 | `#A61B1B` (text on chip-red, 6.3:1); `destructive` `#C62828` is the fill/text of destructive buttons |
| `tag-blue` / `info` | | #0A6ED1 | `#0B5CAD` |
| `tag-purple`, `tag-yellow` | | #7A4CD9, #B8860B | unchanged (no Lockix twin) |
| `ok-soft`, `okSoft` | | tag 12% on card | `chip-green` `#D5F3E0` |
| `warn-soft` | | | `chip-orange` `#FFEBCF` |
| `err-soft` | | | `chip-red` `#FFE4E5` |
| `info-soft` | | | `chip-blue` `#DAEFFE` |
| `lm-shadow-menu` | | 0 1 2 6% | `shadow-menu` = `0 1px 2px rgb(0 0 0/.06)` plus 1 px `stroke-control` border |
| `lm-shadow-overlay` | | 0 2 6 6% | `shadow-popover` = `0 0 0 1px rgb(0 0 0/.1), 0 2px 6px rgb(0 0 0/.06)` (popover window, notification card, tray window; in the page: pill, dock, toast, launcher) |
| `lm-shadow-dialog` | | 0 4 12 7% | `shadow-dialog` = `0 0 0 1px rgb(0 0 0/.1), 0 4px 12px rgb(0 0 0/.07)` |
| `lm-shadow-window` | | 0 18 50 50% | none: floating windows use `shadow-popover` inside a transparent page padded 18-26 px |
| `lm-scrim` | | rgba(0,0,0,.45) | `scrim` `rgb(27 34 48 / .32)` |
| `lm-ring`, `lm-ring-offset` | | 2 px, 2 px | 1 px inside; offset 2 px only for cta button, switch, checkbox, radio, close button |
| `lm-dur-instant/fast/normal/slow/exit` | | 83/167/250/333/120 | `dur-fade-out` 83, `dur-fade-in` 167, `dur-layout` 260, `dur-morph` 330, `dur-exit` 120 (+ `dur-snap` 130, `dur-ui` 190, `dur-gentle` 460, `dur-release` 310, `dur-focus` 120) |
| `lm-ease*` | | cubic-bezier | `ease-spring`, `ease-layout`, `ease-soft` (`linear()` curves in the CSS) |
| radii 6 / 8 / 10 / 12 / 14 / 16 | | per container | see table 5; names `radius-chip/control/card/window/panel/dialog` |
| disabled (40% opacity) | | | opaque `disabled-line/track/fill/text/seg/thumb` (new) |
| track (progress, segmented, skeleton) | `toggle-off`, slider track | | `track` `#F0F0F0` (new); off switch track `#E5E5E5` (= `stroke-control`) with a 1 px inset `stroke-field` ring |
| new | | | `surface-tray #F4F4F4`, `surface-well #F5F5F5`, `stroke-hairline #F0F0F0`, `stroke-field #C3C6CC`, `stroke-focus-field #171717`, `fill-pressed rgb(0 0 0/.07)`, `fill-raised-hover #F7F8FA`, `fill-raised-press #F0F0F0`, `text-placeholder #6B7280`, `text-label-on-white #171717`, `icon #667085`, `icon-quiet #737373`, `cta #201E25`, `text-on-cta #FAFAFA`, `destructive #C62828`, `dot-green #05C283`, `dot-orange #FD9812`, `dot-red #F24349`, `dot-blue #2E9FF1`, `chip-gray #F0F0F0`, `neutral #D0D5DD`, `scroll-thumb rgb(0 0 0/.18)` |
| `designs/gen/kit.ts` `chrome`, `chrome2` | | #DEE1E6, #F1F3F4 | OS-window chrome in mockups: `surface-window` for the title bar, `#F3F3F3` taskbar (see frame 06/04) |

Elevation scale (light, at most two layers, blur at most 12): card `0 0 4px rgb(0 0 0/.07), 0 1px 2px rgb(0 0 0/.04)`; card-ring `0 0 0 1px #EBEBEB, 0 1px 2px rgb(0 0 0/.05)` (a card on a tray or in a dialog); control `0 1px 2px rgb(0 0 0/.06)`; cta `0 2px 4px rgb(0 0 0/.1)`; tab `0 1px 3px rgb(0 0 0/.12)`; popover, dialog, drawer as above; panel = card.

## 4. Components

All sizes are CSS px. "Spec" is what the CSS in `lockix-components.css` reproduces; boxes were measured in Chromium and compare with the Lockix design file and Lockix's rendered layouts (section 6).

### Switch (`lm-toggle`)

DOM: `<button role="switch" class="lm-toggle" aria-checked><span class="lm-toggle__knob"></span></button>`.

| Part | Spec |
| --- | --- |
| Track | 32 x 20, radius pill, padding 2, no border |
| Off | fill `#E5E5E5` (`stroke-control`), inset 1 px ring `#C3C6CC` (`stroke-field`) |
| On | fill `#201E25` (`cta`), no ring |
| Knob | 16 x 16 circle, `#FFFFFF`, `shadow-control`; left 2 (off) / 14 (on); travel 12 px by `translate` |
| Motion | `translate`, `width`, `background-color` 190 ms (`dur-ui`) on `ease-spring`. Reduced motion: instant |
| Hit area | `::after` inset -8 / -12 (56 x 36) |
| Focus | 1 px `accent-default` outline, offset 2 |
| Disabled | off: track `#ECEDEF`, no ring, knob `#C9CCD2`, no shadow. on: track `#B7B9BF`, knob white, no shadow. Cursor not-allowed. No opacity |

### Checkbox and radio (`lm-check`, `lm-radio`)

DOM: `<label class="lm-check"><input class="lm-check__input" type="checkbox"><span class="lm-check__box"><svg>..</svg></span>Label</label>`; radio uses `lm-radio` and an empty box.

| Part | Spec |
| --- | --- |
| Box | 16 x 16, 1 px border `#C3C6CC`, transparent fill; checkbox radius 5, radio full circle |
| Checked | border and fill `#201E25`; glyph and dot `#FAFAFA` |
| Check glyph | Tabler `check` (`M5 12l5 5l10 -10`), 12 px, stroke 2, round caps and joins, non-scaling stroke |
| Radio dot | 8 px circle centred |
| Appear | glyph/dot fade + scale from 50% in 130 ms on `ease-spring` |
| Press | scale 0.92 (130 ms, spring) |
| Hit area | `::after` inset -8 / -12 (40 x 32) |
| Label | 14 px/14, weight 500, `#1B2230`; gap 8 |
| Focus | 1 px `accent-default`, offset 2; when inside a label that has focus, the unchecked border becomes `stroke-control` |
| Disabled | off: border `#D5D7DB`, no fill; on: fill `#B7B9BF`, no border, white mark; label `#A3A9B5` |
| Invalid | border `destructive` + 3 px ring `destructive/20`; checked + invalid keeps `cta` |

### Segmented control (`lm-seg`)

DOM: `<div class="lm-seg">` of `<button class="lm-seg__opt" data-state="on|off">` (Radix ToggleGroup single).

| Part | md (dialogs, Settings) | sm (tool rows) |
| --- | --- | --- |
| Track | height 36, radius 8, padding 2, fill `#F0F0F0`, gap 2 | height 28, radius 8, padding 2, gap 0 |
| Item | height 32, radius 6, 14/20 weight 400, `#5F6A7D`, padding 0 12, 1 px transparent border | height 24, radius 6, 13/16, padding 0 10 |
| Hover | fill `rgb(0 0 0/.04)` | same |
| Selected | `#FFFFFF`, 1 px `#E5E5E5`, `shadow-control`, text `#171717`, weight 500 | same |
| Disabled | track `#ECEDEF`, item text `#9AA0AB`, selected item white without border or shadow | same |

Note the Latch frame 03 draws segment text 13 semi-bold with a `0 1px 2px .12` shadow and no gap; the code (used here) is weight 400/500 with `0 1px 2px .06` and a 2 px gap.

### Buttons (`lm-btn`)

Variants and states are in section 2. Common: radius 8 (`xs` and `icon-xs` radius 6), border 1 px transparent, weight 500, 13/16, tracking -0.01em, gap 6, icon 16 (sm 14, xs 12), press scale 0.97 on `ease-spring`.

| State | primary | secondary | ghost | danger |
| --- | --- | --- | --- | --- |
| rest | `#201E25` | `#FFF`, `#E5E5E5`, shadow-control | transparent | red 10% |
| hover | cta 90% | `#F7F8FA` | `rgb(0 0 0/.04)` | red 20% |
| pressed | cta 80% | `#F0F0F0` | `rgb(0 0 0/.07)` | red 20% |
| open (`aria-expanded`) | | `#F7F8FA` | `rgb(0 0 0/.04)` | |
| focus | 1 px blue outline offset 2 | border `#0069CC` | border `#0069CC` | border red 40% |
| disabled | opacity .5, no pointer events | same | same | same |

Padding x: default 14 (8 on the icon side), sm 12 (6), xs 8, xl 18. Heights 36 / 28 / 24 / 40. Window-card action (`lx-btn-card`): 28 high, 8 / 10 padding, gap 5, 12.5/15, no tracking. Close button (`lm-close`): ghost 24 x 24, radius 6, 12 px glyph `#475467`, 32 x 32 hit area; put it at container radius - 6 from the corner (dialog 10 px, notification card 6 px).

### Text field and select (`lm-input`, `lm-select__trigger`)

36 high (sm 28), radius 8, 1 px `#E5E5E5`, fill white, `shadow-control`, padding 4 / 12, 13/16, placeholder `#6B7280`. Focus (caret or keyboard): 2 px `#171717` made of the border plus a 1 px inset line, no halo, nothing moves. Disabled: fill `#E5E5E5` at 50% and opacity .5. Select trigger: min-width 160, chevron 16 `#5F6A7D`, hover `#F7F8FA`. Select list uses the menu spec.

### Menu, select list, popover (`lm-menu`, `lm-popover`)

Surface white, 1 px `#E5E5E5`, radius 10, padding 4, `shadow-menu`, min-width 128 (sub menu 96), 14/20. Item: 28 high, radius 8, padding 4 / 6, gap 6, icon 16 `#667085`; hover and keyboard highlight `rgb(0 0 0/.04)`; destructive item text and icon `#C62828`, highlight red 10%, last under its own separator. Label 24 high, 12/16 weight 500 `#5F6A7D`. Separator 1 px `#EBEBEB`, margin 4 -4. Shortcut 12 px, `#5F6A7D`, wide tracking. Popover: width 296, padding 12, gap 10. Enter 260 ms `ease-layout` (fade, zoom 95%, slide 4), exit 83 ms ease-in.

### Tooltip (`lm-tooltip`)

Fill `#1B2230`, text `#F0F0F0`, radius 6, padding 6 / 12, 12/16 (28 high), max-width 320, gap 6, 10 px arrow rotated 45 with radius 2. Enter 100 ms fade + zoom 95%.

### Badge, status pill, tag (`lm-badge`, `lm-pill`, `lx-tag`, `lx-count`, `lx-tile`)

| Element | Spec |
| --- | --- |
| Badge (shadcn) | 20 high, pill, padding 2 / 8, 12/16 weight 500; default `#0069CC` + white (use sparingly), secondary white, outline 1 px `#EBEBEB` |
| Status pill | 20 high, pill, padding 2 7 0, 11.5/14 weight 500; gray `#F0F0F0`/`#475467`; green `#D5F3E0`/`#17693D`; orange `#FFEBCF`/`#9A5200`; blue `#DAEFFE`/`#0B5CAD`; red `#FFE4E5`/`#A61B1B` plus inset 1 px of the red at 55% |
| Tag (code chip) | 22 high, radius 6, `#F5F5F5`, mono 12/14, `#475467`, padding 0 8 |
| Count | 20 high pill, `#F0F0F0`, 12 px `#5F6A7D`, tabular numbers |
| Tile | 32 x 32, radius 8, 16 px icon (stroke 1.5, 1 on the grey tile); grey `#F5F5F5`/`#737373`, amber chip-orange/tag-orange, red chip-red/tag-red |
| Dot | 8 px circle in `dot-*`; progress bar fill `dot-green` on `#F0F0F0`, 5 px |

### Dialog (`lm-dialog`)

Width 384 max (the unlock dialog is 520), padding 16, gap 14, radius 16 (win32 10), fill white, `shadow-dialog`, 14/20. Title 15/1 weight 600; body `#5F6A7D`; footer right-aligned, gap 8, top padding 6, buttons `xl` (40). Close button at 10 / 10. Scrim `rgb(27 34 48 / .32)` (a sheet uses black 10% plus 4 px blur). Enter 260 ms `ease-layout`, fade + zoom 96% + rise 8 px; exit 120 ms ease-in with zoom 98%. Sheet: radius 16 on the free edge, slides 32 px.

### Tray and panels (`lx-tray`, `lx-panel`)

Tray: fill `#F4F4F4`, padding 4, radius 14 (win32 10). Head: min-height 38, padding 4 / 16, title 13/20 weight 500, count pill, actions right with gap 6. Card inside: radius 10, white, `shadow-card-ring`, rows divided by 1 px `#F0F0F0`. Foot: min-height 36, padding 4 / 16, 12 px `#5F6A7D`. Panel: white, radius 14 (win32 8), no stroke, `shadow-card`; panels sit 4 px from the window edge, 8 px apart. Shell: title bar 36, footer 28, rail 48 wide with 36 px items 4 px apart, left panel 250. Nav row: 36 high, radius 8, padding 0 10, 13/18 `#475467`, hover `rgb(0 0 0/.04)`, selected `#F0F0F0` weight 500.

### Floating windows

Windows are transparent OS windows; their page pads room for the shadow.

| Window | Spec |
| --- | --- |
| Notification card | 356 wide, radius 12 (win32 10), white, `shadow-popover`, padding 14, gap 10. Head: 32 px tile, gap 12, title 13.5/20 weight 500 (2 lines max), sub 12.5/17 `#5F6A7D`, close button 24 at 6 / 6. Meta row: pill (20) + 12 px text; actions 28 high. A 4 px bar down the left edge for first-time (`dot-orange`) and denied (`dot-red`); a plain read has none |
| Stack | page padding 10 18 26, cards 8 apart, newest on top, at most 4, enter 167 ms ease-out with a 4 px rise. Window placement: Windows 16 px from the right and 12 px above the taskbar |
| Undo toast | 356 x 52, same surface, padding 0 14, gap 12: a 24 px ring (stroke 1.92, track `#F0F0F0`, arc `#201E25`, seconds 11/13 weight 500), text 13.5/20 weight 500, ghost `sm` "Undo", close |
| Tray window | 320 wide, radius 14, white, `shadow-popover`, padding 0 8 8, page pad 24. Header 32 high (20 px logo tile, title 13/16 weight 500); status line 18/24 weight 500, -0.02em; progress bar 5 px; rows 32; a full-width outline button 32; footer 36 with two ghost `sm` buttons; arrow 20 x 10 `popover` fill when the edge is top |
| Approval window | a grey tray window (radius 14, padding 4) holding a white card (radius 10); decision control = md segmented control, primary action = full-width `cta` button; frame 09 and `frames/app/approval-window.png` |

### Motion

Springs as `linear()` easings: `ease-spring` (zeta .80: snap, UI, release), `ease-layout` (.86: panels, menus, sheets, dialogs), `ease-soft` (.90-.92: progress, rings). Durations: snap 130, ui 190, layout 260, morph 330, gentle 460, release 310, fade-in 167, fade-out 83, exit 120, focus 120. One rule fades every control: entering a state 167 ms ease-out, focus 120 ms, press 130 ms spring, leaving 83 ms ease-in; colour, opacity, transform only. Nothing runs longer than 350 ms after an input; exits are shorter than entrances. Skeleton waits 150 ms, fades in 167 ms, then pulses at 2 s; the loading bar (160 x 6, radius 3) replaces skeletons in pop-ups: bar 40% of the track, 1.4 s, transform only. A determinate `lm-progress` is 4 px high. Reduced motion zeroes the durations, turns the springs into `ease-out`, drops enter/exit animation and the press scale and keeps the colour fades.

### Typography

Inter Variable; JetBrains Mono Variable for code. Sizes used: 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 18, 22 (page title 22/26 weight 600). Weights 400, 500, 600. Controls 13/16; menus and dialog body 14/20; secondary text 12.5/17 or 12/16 in `#5F6A7D`. Tracking -0.01em on buttons, inputs and selects; -0.02em on the 18 px status line. Icons Tabler outline, stroke 1.5, with non-scaling strokes.

## 5. Radius per container level

| Token | px | Used for |
| --- | --- | --- |
| dialog | 16 | dialogs, sheet edges (win32 10) |
| panel | 14 | shell panels, banners (win32 8) |
| tray | 14 | grey tray and tray window (win32 10) |
| window | 12 | notification card and undo toast (win32 10) |
| menu, card | 10 | menus, selects, popovers; cards, alerts, list rows |
| control, track, item, menu-item | 8 | buttons, inputs, selects, segmented track, rail items, 32 px tiles, menu items |
| chip | 6 | close button, segments, tags, tooltip, xs buttons |
| check | 5 | checkbox |
| xs | 4 | kbd, link focus |
| bar | 2 | slider tick |
| pill | full | status pills, dots, switch, scroll thumb, badge |

Nesting rule: inner = max(2, outer - inset); a child whose inset is at least the outer radius takes its own token. Menu 10 contains item 8 (exempt); dialog 16 contains close 6 at inset 10.

## 6. Verification

- Rendered `code/packages/ui/tests/fixtures/lockix/spec-page.html` in Chromium (Playwright, 2x). Boxes: switch 32 x 20, knob 16 at left 2 / 14, checkbox and radio 16, segmented 132 x 36 with 32 px items, buttons 36 / 28 / 24 / 40, input 36, pill 20, tag 22, menu item 28, label 24, tooltip 28, notification card 356 wide, toast 356 x 52, tray head 38, foot 36.
- Compared the switch, checkbox, radio and segmented row against the Latch frame export (frame 03, "5 Solid grey"): geometry equal within 1 px. Colour differences are deliberate: the design file draws the off strokes `#838893` and semibold segment text, while the app (code, test-asserted `--field: #c3c6cc`) uses the lighter stroke, so the CSS follows the code. If the product owner wants the darker stroke the design file shows, set `stroke-field` to `#838893` (3.6:1 on white; `#C3C6CC` is about 1.7:1 despite the Lockix comment that says 3.6).
- Compared the notification card with the real render `frames/app/notification-card.png` and `lockix-notification-card.layout.json`: padding 14, tile 32 at (14, 14), kind bar 4, close 24 at 6 px. Card height depends on the text lines (134 for one title line, 153 to 155 for two).
- Not pixel-diffed against a rendered Lockix page: dialog, menu, tooltip, tray window and the toast ring (no Lockix render of the toast; its numbers come from the code and frame 06). Lockix could not be built here because it is read only.

## 7. Frames (`docs/lockix-design-system/frames/`)

| File | Shows |
| --- | --- |
| 01-components-and-tokens-light | Components board: colours, spacing, type scale, radius, elevation, motion, buttons, form controls, status pills, tray icon states, approval window, windows, toasts, banners |
| 02-components-states | Same board with hover / pressed / focus / disabled states |
| 03-disabled-toggles-variations | Switch, checkbox, radio, segmented in five disabled treatments on white and on the `#F0F0F0` shell; variation 5 is the chosen one |
| 04-notification-cards-stack | Stack of four notification cards (read, read x3, first time amber bar, denied red bar) over the taskbar |
| 05-notification-card-states | Card states: every time, screen locked, Undo after Block, failed |
| 06-undo-toast | The 52 px toast with its countdown ring between two cards (older merged layout, shown for the toast) |
| 07-tray-popover | The 320 px tray window above the taskbar: status, progress, Lock now, Open and Quit |
| 08-tray-popover-waiting | Tray window with a waiting request row |
| 09-approval-window | Approval window: grey tray with a white inner card (key/value rows, tag chips, signed/unsigned pills), Allow/Block segmented control, black full-width Block button, kbd hints on the tray |
| 10-settings-general | Settings > General on the shell: left panel 250, switches in a tray card |
| 11-settings-unlock-security | Settings > Unlock & security with radios, selects, switches |
| 12-vaults-table | Table in a panel: row states, field focus ring following the card corners |
| 13-menus | Dropdown menu geometry (shadcn match): radius 10, items 28, min 128 |
| 14-mcp-approval-cards | Approval cards for AI access, pairing and tier 2 |
| 15-loading-bar-popups | Loading bar in pop-ups: track 160 x 6, radius 3, `#F0F0F0`; bar 64 px (40%) `#0069CC`; label 12/16 `#5F6A7D` 8 px below; waits 150 ms; slides 1.4 s |
| 16-header-and-menu-groups | Title bar (36), session chip and grouped menus with a destructive last item |
| 17-activity-table | Activity table with search focused |
| app/*.png | Real Lockix renders (light): notification-card, tray-popover, unlock-dialog, programs-row-menu, settings-notifications, approval-window, home-unlocked |

Window chrome from the frames: title bar 36 on `#F0F0F0` with a 20 px logo tile 8 px from the left, window controls 36 wide and transparent with `#475467` symbols; panels start under the bar; footer 28 under the panels.

## 8. Not covered

Table, drawer, sheet, skeleton, alert and scroll-area internals are only summarised in `tokens.json` and the CSS (progress, slider, scrollbar); read the Lockix files for those before porting them. The toast ring and tray window were not pixel compared.

## 9. Applied (2026-11-02)

Speak Kit applies the system light only ([ADR 0015](decisions/0015-light-only.md)). The summary of the shipped look is in [design-system.md](design-system.md).

| Lockix | Speak Kit |
|---|---|
| `tokens.json` colours, radii, shadows | token blocks of `code/packages/ui/src/lumen.css`; `tokens.ts` generated from it; `designs/gen/kit.ts` LIGHT |
| `lockix-components.css` (`lm-*`, `lx-*`) | `code/packages/ui` React and vanilla components (button, switch, checkbox, radio, segmented, input, select, menu, popover, tooltip, dialog, toast, badge, tray) |
| Floating windows (transparent, 1 px ring, popover shadow, 14/12 radius) | desktop mini player and tray panel windows; in-page pill, bubble and launcher in the extension |
| Window `#F0F0F0`, white panels r14 | desktop app shell, extension options, side panel |
| Primary `#201E25` button, switch on, checked box | every primary action, including play and pause (white filled glyph) |
| Frames in `frames/` | compared against `designs/next` frames (see review.html) |

Deliberate differences from Lockix:

- Reading highlight stays yellow (`hlSent` #FFF1C2, `hlWord` #FFD24D); Lockix has no highlight.
- Icons stay Tabler outline (stroke 1.5); transport glyphs (play, pause, stop) are solid.
- Blue `#0069CC` is only the focus ring, links, selection and progress; it never fills a button.
- Kept `tag-purple`, `tag-yellow` and the reader `paper` theme.
- No dark mode; the in-page UI stays white over dark host pages. Logo and store assets keep dark variants.
- Switch and checkbox off strokes follow the code (`#C3C6CC`), not the darker design-file stroke (section 6).
