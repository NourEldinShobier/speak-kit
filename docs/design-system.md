# SpeakKit design system = Lumen

Source: `D:\workspaces\perplexity\designs\Lumen — AI answer engine (open-source Perplexity alternative).figcraft` (10 pages: Web app, Desktop app, Foundations & components, Browser & devices, Motion, Browser layouts, Generative UI, Browser features, Arc-inspired features). Read from the file: the variable collection "Lumen / Color" (Light + Dark), the "Components and states" board (web) and "Desktop components" board. SpeakKit uses the same tokens in light and dark; dark follows the OS/browser.

## Color tokens (Lumen name -> SpeakKit variable)
| Lumen | SpeakKit | Dark | Light |
|---|---|---|---|
| surface-window | `--bg` | #191A1B | #F3F3F6 |
| surface-editor | page canvas behind cards | #121314 | #FFFFFF |
| surface-card | `--surface` | #1E1F20 | #FAFAFD |
| surface-raised | `--surface2` (insets, hover rows) | #252627 | #EBEBEE (fill-hover over card; Lumen raised is #FFFFFF) |
| surface-input | inputs | #191A1B | #FFFFFF |
| stroke-divider | `--border` | #2A2B2C | #E2E2E5 |
| stroke-control | `--stroke-control` | white 8% | black 10% |
| fill-hover / fill-selected | `--fill-hover` / `--fill-selected` | white 8% / 13% | black 6% / 11% |
| text-primary / secondary / tertiary | `--text` `--text2` `--text3` | #E6E6E6 #BFBFBF #8C8C8C | #202020 #3B3B3B #606060 |
| accent-default / accent-button | `--accent` | #0078D4 | #0069CC |
| accent-subtle | `--accent-subtle`; `--accent-soft` is the same tint pre-mixed on the card | 40% | 12% |
| text-on-accent | `--accent-text` | #FFFFFF | #FFFFFF |
| tag-green / orange / red / blue | `--ok` `--warn` `--err` `--info` | #4CC38A #F5A524 #F2555A #4A9EFF | #1A7F4B #B35C00 #C62828 #0A6ED1 |
| tag-purple / yellow | `--tag-purple` `--tag-yellow` | #A77BF3 #F2C04E | #7A4CD9 #B8860B |

Soft status fills (`--ok-soft` etc.) are the tag color mixed 12% (light) / 16% (dark) over the card. Reading highlight (our own): sentence `--hl-sent` (yellow tint, #FFF1C2 light, #433921 dark), word `--hl-word` (#FFD24D light, tag-yellow #F2C04E dark). Never use the accent for highlight: blue is for actions.

## Type, shape, state (from the component boards)
- Font Inter. Page/section title 24 semibold, body 13 regular, small 11 to 12, ALL-CAPS section labels 11 semibold with letter spacing, mono for time and keys.
- Radii: 6 icon button, 8 buttons, inputs, segmented controls and toggle buttons (never a pill), 10 rows and cards, 12 approval/status cards, 14 large inputs and the quick-ask bar, 16 windows and panels, 999 for pills, status pills and the floating working pill.
- Icons: Tabler outline, stroke 1.5, sizes 14/16/20/24. Icon buttons 32 / 28 / 24.
- States: rest, hover (fill-hover), pressed (fill-selected), focus (2 px accent ring with 2 px offset: `--focus-ring`), disabled (40% opacity), loading (spinner replaces the icon, width kept). Motion: 83 ms hover, 167 ms press/fade, decelerate curve `cubic-bezier(0,0,0,1)`.
- Buttons: primary (accent fill), secondary (outline), ghost, danger (red outline). Selected toggle buttons use fill-selected.
- Floating surfaces and dock use the raised surface (#252627 dark) with a 1 px divider border; toast: card surface, 8 radius, action button on the right.

## Where it lives in code
- `code/apps/extension/src/ui/tokens.css` (React UIs), `src/content/ui/css.ts` (Shadow DOM overlay), `code/apps/desktop/src/renderer/styles.css`.
- Designs: `designs/gen/kit.ts` (LIGHT/DARK) regenerated into `designs/screens/*.png` and `designs/review.html`.
