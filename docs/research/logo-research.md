# Logo research (SpeakKit)

**Model:** OpenAI `gpt-image-2.5-sunburst` (precision-first, highest quality; `gpt-image-2.5-flare` is the fast sibling; `gpt-image-1` is retired). Called through `POST /v1/images/generations`, `size 2048x2048`, `quality high`. The API key is passed through an environment variable only; it is never stored in the repo.

**Inspiration reviewed:** the 20 images in `drive/logos`, 17 Pinterest pins (`drive/logos/pinterest`) and 30 Dribbble shots (`drive/logos/dribbble`). Findings:
- Winning marks are one bold geometric shape, readable at 16 px, on a dark or saturated squircle (Voicely, Hiplay, the sparkle and waveform tiles).
- Waveform marks dominate; the distinctive ones fuse the wave with a second idea (letter, page, ribbon) instead of using a plain equalizer.
- Gradients are short (blue to cyan, green to lime) and used on one element only.
- Generic microphones, speech bubbles and clip-art heads (most Pinterest "text to speech" results) look dated.

**Round 1 (drive/logos/generated/speakkit-logos-v1.png):** four concepts on app-icon tiles: 1 K-Wave (K built from equalizer bars), 2 Page Voice (text lines turning into a wave), 3 S-Ribbon (S as a continuous wave ribbon), 4 Highlight Spark (reading highlight with play glyph and sound arcs, the product's yellow highlight as the single accent).

**Round 2 (drive/logos/generated/speakkit-logos-v2.png), after the user's references** (sparkle on black squircle, layered pastel cards, bubble in a window, gradient ribbon loop, flat blob icons): one soft hero shape per icon, no lines or bars. 1 Listening Bloom (glassy bubble-ripple blob), 2 Pages Fading Into Voice (layered cards dissolving), 3 Window of Sound (glossy bubble in a blue window on white), 4 One Ribbon (tube ribbon forming a K).

**Round 3 (speakkit-logos-v3.png and speakkit-logos-v3-thinking.png), with reference images passed to the API.** Rounds 1 and 2 used text prompts only. Round 3 sends the 11 favourite logos (7 new: EDIT, yeeup, Questlin, Angel Cube, The Bad Lab, connect, Feel-well, plus the 4 earlier favourites) as input images. v3 uses `/v1/images/edits` (sunburst, quality high). The "thinking" variant uses the Responses API: `gpt-5.5` with reasoning effort high plans and rewrites the prompt, then calls the `image_generation` tool with `gpt-image-2.5-sunburst` at quality `max`. The images API itself has no `thinking` parameter (only a third-party relay does). Concepts: 1 Stagger (letters in staggered boxes tracing a waveform), 2 Overlap (two translucent circles), 3 Slide (gradient pills replacing "kk"), 4 Module (hexagon with a sound-arc bite). The thinking run fixed v3's misspelling of concept 3 ("Speak it").

**Round 4 (speakkit-logos-v4-six.png).** Six fluid single-form marks from five references (white blob, aqua-violet mesh wave, mint-orange ribbon, green two-lobed waveform, white zig-zag pulse), made with the thinking pipeline (gpt-5.5 high reasoning, then gpt-image-2.5-sunburst at quality max, 3072x2048): 1 Liquid Swell, 2 Monolith, 3 Two Voices, 4 Ribbon K, 5 Liquid Pulse, 6 Page Wave.

**Round 5 (speakkit-logos-v5-six.png).** Same pipeline as round 4, with the v4 sheet passed as a reference and mark 6 (page block) banned: 1 Swell Duo, 2 Twin Lobes, 3 Loop K, 4 Echo Drop, 5 Pulse Silhouette, 6 Aurora Wave.

**Round 6 (speakkit-logos-v6-six.png), creative concepts with a visual idea each:** 1 Quote (two glossy lobes forming a quotation mark), 2 Caret Voice (text cursor swelling into a voice pulse), 3 Wren (singing songbird), 4 Folded Voice (origami paper turning into a wave), 5 Listening Spiral (ear/scroll coil with a yellow core), 6 Play Drop (liquid play button with a ripple ring).

**Round 7 (speakkit-logos-v7-six.png), creative inside the wave and wave+K territory:** 1 Twisted Wave (Mobius ribbon), 2 Wave Orb (liquid wave inside a glass orb), 3 Ripple Print (white rings with a wave crest), 4 K Pulse (white K whose stem is a voice pulse), 5 K Crest (tube K from one wave ribbon), 6 K Tile (K cut from a gradient tile over a wave).

**Round 8 (speakkit-logos-v8-six.png), v4 style only:** v4 as the main reference (marks 1-5 loved, mark 6 rejected), less glossy than v5/v7: 1 Swell II, 2 Monolith K, 3 Two Voices II, 4 Ribbon K II, 5 Pulse II (with highlight dot), 6 Gradient Monolith.
