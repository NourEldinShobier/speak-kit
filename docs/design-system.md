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
- Panels (sidebar, content) are white r14 on the grey window, 4 px from the edge and 8 px apart, no stroke, shadow `card`.
- Shadows are FigCraft drop-shadow effects with at most two layers: control `0 1 2 6%`, menu the same plus a 1 px stroke, popover and pill `1 px ring 10% + 0 2 6 6%`, dialog `ring + 0 4 12 7%`, card `0 0 4 7% + 0 1 2 4%`, card on a tray `1 px #EBEBEB + 0 1 2 5%`, cta `0 2 4 10%`.
- Buttons 36 (default), 28 sm, 24 xs, 40 xl (dialog footers), r8. Primary = cta black, secondary = white with a 1 px stroke and control shadow, ghost, danger = 10% red tint. Disabled = 50% opacity.
- Switch 32x20 with a 16 px white knob (off: #E5E5E5 track with a 1 px #C3C6CC ring, on: cta). Checkbox and radio 16 px, 1 px #C3C6CC, checked = cta with a #FAFAFA mark (check 12 px stroke 2, radio dot 8 px). Segmented 36 high on #F0F0F0, selected item white with a 1 px stroke. Input and select 36 high, focus = 2 px #171717.
- Font Inter, controls 13 px, menus and dialog body 14 px. Icons: Tabler outline, stroke 1.5, sizes 12/14/16/18/20/24. Icon buttons 36 / 28 / 24.
- States: rest, hover, pressed, focus (1 px accent, offset 2 on the cta button), disabled, loading. Motion tokens are in the Lockix spec.

## Where it lives in code
- Colours are defined once, in the token blocks of `code/packages/ui/src/lumen.css` (plus `--text-on-highlight` for text on the word highlight and the `--paper-*` set of the reader's paper theme). `code/packages/ui/src/tokens.ts` is generated from it (`pnpm --filter @speakkit/ui gen:tokens`) for code that cannot read CSS variables (the toolbar badge, the highlight colours on host pages, Electron window colours). `packages/ui/tests/tokens.test.ts` fails on a stale module, on a `var(--x)` with no definition and on a hex colour anywhere but `lumen.css`, `tokens.ts` and the highlight swatches (`features/highlight/colors.ts`, colours users pick and that are painted on pages without Lumen).
- Components: `code/packages/ui` (React and vanilla twins, compared in `tests/parity.test.tsx`); the extension composes them in `code/apps/extension/src/styles/compose.css` and each feature's own css.
- Designs: `designs/gen/kit.ts` (LIGHT) regenerated into `designs/next/screens/*.png`, `designs/next/manifest.json` and `designs/next/review.html` (`bun main.ts`, then `DIR=.../designs/next bun build-review.ts`).

## UI rules added 2026-11-01 (match `code/packages/ui/src/lumen.css`)
- Transport glyphs (play, pause, stop) are solid: fill and stroke are the current colour, round joins, stroke 2.25 px (play, stop) and 2.75 px (pause) on screen. Pause is two thin rounded bars (lines x 8.5 and 15.5, y 5.5 to 18.5 in a 24 box), not Tabler's rectangles. Skip, back and forward stay outline. Play and pause on primary (blue) buttons are white.
- A key chip (Kbd, for example `Ctrl N`) inside a primary (cta) button uses the cta text colour and a 45% white border instead of text-tertiary and stroke-control.
- The paragraph play button (gutter) is not shown on a fresh page. It appears only after reading has started on that page load. The edge launcher tab at the right edge is always shown.
