# SpeakKit design system = Lockix (light only)

The look is the Lockix design system. The full spec, tokens and component CSS are in [`lockix-design-system.md`](lockix-design-system.md), `lockix-design-system/tokens.json` and `lockix-design-system/lockix-components.css`. Speak Kit has no dark mode: there is one light theme. A dark website under the extension is the host page, not our theme; the pill, bubble and launcher are white and stay readable over it (frames B11, B21).

## Color tokens (design generator `designs/gen/kit.ts` LIGHT)
| Role | Key | Value |
|---|---|---|
| window | `bg` | #F0F0F0 |
| panel, card, popover, input | `editor` `surface` `raised` `input` | #FFFFFF |
| well, tray | `well` `tray` | #F5F5F5, #F4F4F4 |
| divider, control stroke, field stroke | `border` `control` `field` | #EBEBEB, #E5E5E5, #C3C6CC |
| text 1/2/3 | `text` `text2` `text3` | #1B2230, #475467, #5F6A7D |
| primary action (button, play, on switch, checked box) | `cta` / `ctaText` | #201E25 / #FAFAFA |
| accent (focus ring, links, selection, progress) | `accent` | #0069CC |
| status text / chip fill | `ok` `warn` `err` `info` / `okSoft`... | #17693D #9A5200 #A61B1B #0B5CAD / #D5F3E0 #FFEBCF #FFE4E5 #DAEFFE |
| destructive | `destructive` | #C62828 |
| hover, pressed, selected | `hover` `pressed` `selected` | black 4%, black 7%, #F0F0F0 |
| scrim | `overlay` | rgb(27 34 48 / .32) |

Reading highlight (our own, `hlSent` #FFF1C2, `hlWord` #FFD24D), `tag-purple` and `tag-yellow` are kept. The accent never fills a button.

## Shape, elevation, controls
- Radii: 16 dialog, 14 panel and tray, 12 floating card and popover, 10 card and menu, 8 control, 6 chip, 5 checkbox, 999 pill.
- Hover fills are concentric (inner radius = container radius minus border and padding, minimum 4): menu and select option 5, segmented option 6, command palette row 8 on macOS and 4 on Windows; the first and last row of a card follow the card corners.
- Panels (sidebar, content) are white r14 on the grey window, 4 px from the edge and 8 px apart, no stroke, shadow `card`.
- Shadows are FigCraft drop-shadow effects with at most two layers: control `0 1 2 6%`, menu the same plus a 1 px stroke, popover and pill `1 px ring 10% + 0 2 6 6%`, dialog `ring + 0 4 12 7%`, card `0 0 4 7% + 0 1 2 4%`, card on a tray `1 px #EBEBEB + 0 1 2 5%`, cta `0 2 4 10%`.
- Buttons 36 (default), 28 sm, 24 xs, 40 xl (dialog footers), r8. Primary = cta black, secondary = white with a 1 px stroke and control shadow, ghost, danger = 10% red tint. Disabled = 50% opacity.
- Switch 32x20 with a 16 px white knob (off: #E5E5E5 track with a 1 px #C3C6CC ring, on: cta). Checkbox and radio 16 px, 1 px #C3C6CC, checked = cta with a #FAFAFA mark (check 12 px stroke 2, radio dot 8 px). Segmented 36 high on #F0F0F0, selected item white with a 1 px stroke. Input and select 36 high, focus = 2 px #171717.
- Font Inter, controls 13 px, menus and dialog body 14 px. Icons: Tabler outline, stroke 1.5, sizes 12/14/16/18/20/24. Icon buttons 36 / 28 / 24.
- States: rest, hover, pressed, focus (1 px accent, offset 2 on the cta button), disabled, loading. Motion tokens are in the Lockix spec.

## Where it lives in code
- Colours are defined once, in the token blocks of `code/packages/ui/src/lumen.css` (plus `--text-on-highlight` for text on the word highlight and the `--paper-*` set of the reader's paper theme). `code/packages/ui/src/tokens.ts` is generated from it (`pnpm --filter @speakkit/ui gen:tokens`) for code that cannot read CSS variables (the toolbar badge, the highlight colours on host pages, Electron window colours). `packages/ui/tests/tokens.test.ts` fails on a stale module, on a `var(--x)` with no definition and on a hex colour anywhere but `lumen.css`, `tokens.ts` and the highlight swatches (`features/highlight/colors.ts`, colours users pick and that are painted on pages without Lumen).
- Components: `code/packages/ui` (React and vanilla twins, compared in `tests/parity.test.tsx`); the extension composes them in `code/apps/extension/src/styles/compose.css` and each feature's own css.
- Designs: `designs/gen/kit.ts` (LIGHT) regenerated into `designs/next/screens/*.png` and `designs/next/manifest.json` (`bun main.ts`). The HTML review page was retired; designs are reviewed in `designs/speakkit.figcraft`.

## UI rules added 2026-11-01 (match `code/packages/ui/src/lumen.css`)
- Transport glyphs (play, pause, stop) are solid: fill and stroke are the current colour, round joins, stroke 2.25 px (play, stop) and 2.75 px (pause) on screen. Pause is two thin rounded bars (lines x 8.5 and 15.5, y 5.5 to 18.5 in a 24 box), not Tabler's rectangles. Skip, back and forward stay outline. Play and pause on primary (blue) buttons are white.
- A key chip (Kbd, for example `Ctrl N`) inside a primary (cta) button uses the cta text colour and a 45% white border instead of text-tertiary and stroke-control.
- The paragraph play button (gutter) is not shown on a fresh page. It appears only after reading has started on that page load. The edge launcher tab at the right edge is always shown.

## App icon
The Voice hub puzzle sits in one container: a continuous-corner squircle (Apple style smoothing 0.6, corner radius 22.4 % of the body, path from `figma-squircle` in `designs/logo/v2/squircle.mjs`). The four pieces are cut larger than the squircle and clipped to it (`<clipPath id="sq">`, also in `logo-data.ts` as `clip`), so the seams run cleanly to the edge and all four corners are identical. Before 2026-11-04 the pieces formed their own outline (a superellipse with uneven seam corners), which read as an irregular shape.

Reference notes (text only, no third-party images kept):
- macOS Big Sur and later: 1024 canvas, 824 x 824 rounded body (100 px transparent margin), corner radius about 185 px (22.4 %), continuous curve, soft shadow 10 px down, blur 20, 30 % black. macOS does not mask or shadow icons, so both are baked into `icon.png` (`macIconPng` in `apps/desktop/scripts/icons-lib.mjs`).
- Windows 11: ICO frames 16, 24, 32, 48, 256 at least (we ship 16 to 256); full-colour squircle, no extra plate. We fill 94 % of the frame from 48 px up and the whole frame at 16, 24 and 32 px.
- Claude Code / Claude desktop: one flat mark inside a rounded-square tile. Our container follows the same idea: one silhouette, mark inside it.
- Seams are white in app, tray and installer icons (a white squircle sits under the pieces) so the icon has no holes on dark docks and taskbars; the in-app `Logo` and the menu-bar template keep transparent seams.

Corner radius compared at 256 px and 32 px: 20 %, 22.4 % and 26 %. 22.4 % chosen (Apple's value; 20 % looks boxier next to system icons, 26 % starts to eat the outer pieces at 32 px).

Alternatives rendered for review only, not in code: B the puzzle at 72 % on a white squircle tile, C the puzzle at 72 % on a deep-blue (#14226B) tile with white seams. A (full-bleed) is the default.

Sizes: macOS 1024 (body 824); Windows ICO 16, 24, 32, 48, 64, 128, 256; extension toolbar 16, 32, 48 (edge to edge) and 128 (94 %); tray 32 px (36 px at 2x on macOS, template cut-out for the plain states).
