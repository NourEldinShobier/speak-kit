# Store graphics

`capture.store.mjs` regenerates the PNGs in `docs/store/assets/` from the real extension: it runs the visual-capture scenarios of `code/e2e/visual` (real built extension, fake engine, fixture article) and frames their output at the store sizes. The visible text on the graphics is only the product name and short captions.

```
cd code/apps/extension
SPEAKKIT_TEST=1 pnpm exec vp build --outDir dist-visual
pnpm exec vp test run --config store/vite.config.ts
```

Needs the Playwright Chromium (`pnpm exec playwright install chromium` in `code/e2e`). Uses port 51730 (the visual harness port). It is not part of `pnpm test`.

| Output                            | Size     | Source scenario                  |
| --------------------------------- | -------- | -------------------------------- |
| `screenshot-1-popup.png`          | 1280x800 | A4 popup, playing                |
| `screenshot-2-dock-highlight.png` | 1280x800 | B6 page, dock and highlight      |
| `screenshot-3-edge-launcher.png`  | 1280x800 | B18 edge launcher open (dark)    |
| `screenshot-4-options.png`        | 1280x800 | C4 options, voice and speed      |
| `screenshot-5-queue.png`          | 1280x800 | C9 side panel, queue and outline |
| `promo-small-440x280.png`         | 440x280  | icon, name, tagline              |
| `promo-marquee-1400x560.png`      | 1400x560 | icon, name, tagline, A4 popup    |
| `icon-128.png`                    | 128x128  | copy of `public/icons/128.png`   |

Screenshots and tiles are 24-bit PNG without alpha, as the Chrome Web Store requires. When the UI changes, rerun this and commit the new PNGs.

`pack-store.mjs` (in `../scripts`) builds the zip: `pnpm run pack:store` from this package.
