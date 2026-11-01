# SpeakKit logo, round 2

Six marks built from SpeakKit's own story instead of from any one reference: the K of Kit, text turning into voice, and the warm word being read. The reference images in `../refs/` (not committed) only set the mood: fluid, wavy, one idea per mark.

Figma: https://www.figma.com/design/laNgdWcGxc1QjZeGnQ74pz, page "Round 2 · SpeakKit style" (components under "Round 2 masters").

| Mark | Idea |
|---|---|
| 01 Liquid K | One liquid body; the arm releases a warm drop, the word being spoken |
| 02 Turning K | Arm and leg are one ribbon that turns over at the stem: page side blue, voice side warm |
| 03 Wave K | A warm voice wave flows into the K where its arm and leg leave |
| 04 Spoken S | The S of Speak as one ribbon turning over at its spine |
| 05 Speaking K | Mono K whose arm and leg leave the stem as sound waves, plus one warm dot |
| 06 Voice ribbon | A spoken phrase as a satin ribbon that swells at each stress and turns over once |

## Style rules
- Two hues: page blue (`#5FA2FF` → `#2F7BFF` → `#3A4BE8`) and highlight warm (`#FFE08A` → `#FFC83D` → `#FFA62B`). Warm marks the voice or the word being read, never decoration.
- One soft light from the top left and a faint shade at the bottom. No specular spots, no rims, no outer glow.
- Ribbons turn over with a light fold (`#DCE8FF`), never a dark one; ribbon ends are cut, liquid ends are round.
- App tile: dark squircle, mark at 60 % of the tile.

## Files
- `svg/<mark>.svg` free mark (1024 canvas), `svg/<mark>-tile.svg` app icon.
- `kit.mjs` geometry: shapes are signed distance fields joined with smooth unions, traced with `d3-contour` and fitted to Bezier curves with `fit-curve`; ribbons are built from a centre line and a turn angle.
- `marks.mjs` the six marks. `node marks.mjs [name...]` rewrites `svg/`.
- `preview.mjs` review grid: `node preview.mjs out.png svg/a.svg svg/b.svg`.
- `round2-board.png` the Figma board.
