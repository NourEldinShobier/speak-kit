# SpeakKit logo exploration: brief for every designer

SpeakKit is a private, on-device text-to-speech app: a Chrome extension and a desktop app read web pages and documents aloud with local voices. Name = Speak + Kit. The word currently being read is highlighted in warm yellow in the product. The owner loves **wavy, fluid forms**; letter K is welcome where it fuses with a wave.

## What "good" means here
- One idea, one hero form, drawn with craft: every curve smooth (no kinks, no flat spots, no wobble), consistent stroke widths, deliberate proportions, optical balance and optical centring.
- Faithful to the named reference(s): match their construction, proportions, curve character, finish (flat vs. soft sheen) and colour logic, then translate to SpeakKit.
- Recognisable at 16 px and 32 px (check the small row of the render sheet). If detail dies at 16 px, simplify.
- Distinctive. Not a stock "audio" icon, not a microphone, not a speech-bubble clip-art, not equalizer bars in a row.

## Palette (use these; small deviations allowed when a reference demands it)
azure #0078D4 · sky #4A9EFF · aqua #4DE6E0 · mint #7FE5C4 · lilac #B9A6FF · violet #6B3BFF · indigo-blue #1E4BFF · cyan #3FE0FF · ink #0B0C0E / #101113 · white #FFFFFF · off-white #F4F4F2 · butter yellow #F2C04E (only as the small "word being read" accent).
Gradients: 2 to 5 stops, never passing through grey/brown midtones (insert an intermediate stop if two ends would mix muddy).

## The references (all in designs/logo/refs/; open the ones your concept names with the Read tool and study them closely)
- r01 iridescent sparkle on black squircle: concave four-point star, long fine vertical tips, shorter horizontals, mint-white-lilac sheen.
- r02 scalloped blobs on a white tile: flat saturated wavy-edged shapes (8-point wavy star, 10-scallop disc, 10-petal flower, 5-lobe clover), very soft shadow; second tile shows soft jelly/clay 3D.
- r03 monoline pulse: one thick round-capped stroke (uniform width), flat lead-in, tall crest, deep trough, flat tail; gradient violet → blue → cyan along the stroke; flat finish.
- r04 sparkle + lens bars: white four-point sparkle fused with three vertical lens (vesica) bars of decreasing height, a hairline cut where they meet; on deep blue.
- r05 loop ribbon: thick round-capped ribbon scribble with one small loop and one self-crossing (the crossing reads as depth); mint → yellow → orange gradient on dark.
- r06 white liquid pulse: white filled silhouette, four forward-leaning peaks with rounded drippy tips and pinched necks, pointed lead-in/tail.
- r07 white blob: one inflated white organic shape, slanted, four soft lobes.
- r08 isometric outline modules: thick monoline isometric hexagonal prisms sharing walls.
- r09 soft pyramid: white rounded pyramid with one face cut away to a warm-yellow → blue → cyan gradient.
- r10 bubble in a window: white squircle tile, inner black superellipse window, soft white form inside, blue glow rising from the window's bottom.
- r11 outlined hex cube: white rounded hexagon outline with a glossy lilac → violet gradient rhombus as the top face.

## SVG rules (the files are imported into Figma with createNodeFromSvg)
- Root: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">`.
- Allowed: path, circle, ellipse, rect, g, defs, linearGradient, radialGradient, clipPath, and at most 2 filters (soft glow or shadow only). Not allowed: text (letters must be paths), image, style, use, pattern, external hrefs, currentColor.
- Prefix every id with your concept number (e.g. `id="c07-grad"`).
- Gradients: `gradientUnits="userSpaceOnUse"` with explicit coordinates.
- Two layouts: (a) app-icon tile: the tile fills the canvas, `<rect width="1024" height="1024" rx="232"/>` (or a smoother squircle path), mark about 56-66 % of the tile; (b) free-standing mark on a transparent canvas, longest side about 700-760 px, optically centred. White marks always sit on a dark tile (they vanish on light backgrounds).
- Curves: cubic Béziers with collinear handles at every smooth anchor (G1 continuity). Prefer computing geometry with a small generator script (save it as `designs/logo/gen/<NN-slug>.mjs`, run with node, paste or write the output) over guessing numbers.

## Process (mandatory)
1. Read this brief and your reference images.
2. Write `designs/logo/svg/<NN-slug>.svg`.
3. Render: `node designs/logo/tools/render.mjs designs/logo/svg/<NN-slug>.svg` then Read `designs/logo/renders/<NN-slug>-sheet.png`. Fix every lint warning.
4. Critique like an art director: compare side by side with the reference; list concrete defects (kinks, uneven widths, off-centre, muddy gradient, weak 16 px, too similar to stock icons) and fix them. Repeat render → critique → fix at least 3 times; stop when the remaining issues are minor.
5. Do not touch other designers' files.
