# Logo research (SpeakKit)

**Model:** OpenAI `gpt-image-2.5-sunburst` (precision-first, highest quality; `gpt-image-2.5-flare` is the fast sibling; `gpt-image-1` is retired). Called through `POST /v1/images/generations`, `size 2048x2048`, `quality high`. The API key is passed through an environment variable only; it is never stored in the repo.

**Inspiration reviewed:** the 20 images in `drive/logos`, 17 Pinterest pins (`drive/logos/pinterest`) and 30 Dribbble shots (`drive/logos/dribbble`). Findings:
- Winning marks are one bold geometric shape, readable at 16 px, on a dark or saturated squircle (Voicely, Hiplay, the sparkle and waveform tiles).
- Waveform marks dominate; the distinctive ones fuse the wave with a second idea (letter, page, ribbon) instead of using a plain equalizer.
- Gradients are short (blue to cyan, green to lime) and used on one element only.
- Generic microphones, speech bubbles and clip-art heads (most Pinterest "text to speech" results) look dated.

**Round 1 (drive/logos/generated/speakkit-logos-v1.png):** four concepts on app-icon tiles: 1 K-Wave (K built from equalizer bars), 2 Page Voice (text lines turning into a wave), 3 S-Ribbon (S as a continuous wave ribbon), 4 Highlight Spark (reading highlight with play glyph and sound arcs, the product's yellow highlight as the single accent).
