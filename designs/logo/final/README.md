# SpeakKit logo: Voice hub (final)

A kit of four pieces cut apart by two voice waves, held together by a round voice disc. The blue disc speaks; the yellow piece is the word being read.

Figma: https://www.figma.com/design/laNgdWcGxc1QjZeGnQ74pz, page "Final · SpeakKit logo" (components under "Logo masters" and "Lockup masters").

## Files (`svg/logo/`)
| File | Use |
|---|---|
| `speakkit-logo.svg` | Primary, 64 px and up (soft shadow under the hub) |
| `speakkit-logo-flat.svg` | Primary without the shadow |
| `speakkit-logo-small.svg` | 48 px and below: wider seams, bigger hub, bolder wave |
| `speakkit-logo-mono-ink.svg` / `-mono-white.svg` | One colour, wave knocked out of the hub |
| `speakkit-logo-small-mono-ink.svg` / `-small-mono-white.svg` | One colour, small sizes |
| `speakkit-lockup-horizontal-{ink,white}.svg` | Mark + wordmark side by side |
| `speakkit-lockup-stacked-{ink,white}.svg` | Mark over wordmark |
| `speakkit-wordmark-{ink,white}.svg` | "SpeakKit" in Inter Semi Bold, tracking -2 %, outlined |

## Colours
Hub `#2F6BFF` · sky `#2EC5FF` · read-word yellow `#FFC23D` · violet `#7B61FF` · deep blue `#1F3FD1` · ink `#14161B`.

## Rules
- Small version at 48 px and below, full version above.
- Clear space: a quarter of the mark's width on every side.
- Don't recolour, rotate or rearrange the pieces; the only effect is the hub shadow.
- One colour: ink on light, white on dark.

## Regenerate
`node logo.mjs` (marks) then `node lockups.mjs [Inter-Variable.ttf]` (lockups; needs `npm i` in `../v2` for fontkit). Explorations: `puzzle.mjs` (Puzzle kit palettes), `wave-variants.mjs` (round 4).
