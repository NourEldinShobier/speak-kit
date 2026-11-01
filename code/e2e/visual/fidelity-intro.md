# Visual fidelity

Built UI compared with the restructured designs in `designs/next` (`screens/<ID>.png`, `manifest.json`, Lumen structure; dark is the default theme, light twins carry the `-L` suffix). The harness in `code/e2e/visual` drives the real extension (Chromium, MV3, test build), the real SpeakKit server with the fake engine and the real Electron app, captures every state in dark and light, diffs each capture against its design crop with pixelmatch and looks at the side-by-side images. `node report.mjs` copies the screenshots to `designs/built` and builds `designs/built/review.html` (the review page: one horizontally scrolling row per feature group, approve / change / reject with notes, light and dark per card, optional design beside the screenshot, lightbox).

{{COUNTS}}

Definitions: match = within about 2 px and the same tokens; minor drift = 2 to 4 px drift or a small component or colour difference; drift = a visible layout or component difference; known difference = the design shows something the product does not produce (feature absent, live data, native window chrome). Product-only screens (no design frame) and light captures without a light twin in the design set are listed in `designs/built/review.html` but not counted in the tally.

How the verdicts were made: the Diff % column is pixelmatch over the whole crop. It is only a rough guide: dark pages are mostly background, so a screen whose layout is far off still scores 3 to 8 %, while text-only screens never go below about 2 % because Figma and Chromium rasterise Inter differently. The verdict and reason are my reading of the side-by-side image (`out/sbs`, contact sheets from `sheet.mjs`). Reasons that end with "not viewed side by side" were set from the pixel metric and the known component list only. Light captures reuse the verdict of the dark capture of the same state.

How the states are forced

- Popup, options and side panel run as real extension pages with a thin wrapper around `chrome.runtime.sendMessage`, `chrome.tabs.query` and `chrome.scripting` that answers get-state, get-health, get-queue and the active tab (exact times, queue items, engine states and error states). Engine asleep and waking come from `engine.state = "unloaded"` in the mocked health answer.
- Page screens use the real content script on a fixture article and forge the background broadcasts (`state`, `sentence-start`, `toast`, `reader`) through the service worker. Reader view is opened with the `reader` message and its settings are seeded (Serif, 19, paper / light / dark).
- Options screens use the real server (C2 and C13 point at a closed port, C3 stores a wrong token).
- Desktop screens launch the Electron app with the fake engine and a config file (`theme`, `setupDone`). `SPEAKKIT_FAKE_STATE` forces downloading, error, unloaded or loading; `SPEAKKIT_TEST=1` exposes the tray test hook, used to open the Quit confirmation.
- Theme: the browser page and the Electron window follow the emulated colour scheme; the article fixture gets a dark page for dark captures.

Design crops (1x, the PNGs are 2x of a 1440x900 frame): popup card 360 px wide at (264, top of card); browser viewport 1278x718 at (81, 131); side panel 399x718 at (960, 131); narrow options 758x718 at (121, 131); desktop window content 1278x798 at (81, 51); narrow desktop window 1013x766 at (209, 67).

## Fixes made while checking

- Popup: width 380 to 360 px, now-playing row without card, 20 px top padding, 52 px play button with 14 px gaps, footer band on the window surface, times in Inter (were monospace), offline and error states without card border, 14 px body and full-width stacked buttons.
- Read-aloud pill: min height 52 px, 220 px progress column, raised above the reader overlay (it was hidden behind it).
- Reader view: the page heading is no longer repeated as the first paragraph; the reading panel is titled Reading and its toggle reads Highlight sentence.
- Side panel: tinted now-playing card, 12 px captions, current paragraph row with accent number and speaker, Up next as cards with a play tile, empty state without a border, times in Inter.
- Options page: below 1025 px the nav collapses to a select at the top, 20 px padding, rows stack.
- Desktop shell: title bar search centred in the window (the 140 px caption-button reserve moved to the right group), sidebar content aligned with the design (the nav had a second 12 px padding), New reading is the primary button with a Ctrl N key, nav order Home, Library, Voices, Engines, Browser, engine status card and Settings at the bottom.

## Systematic differences that are not defects

- The generator draws Tabler icons about 3 to 4 px right of and below their box centre; built icons are centred.
- Highlight boxes in the design have 5 px right padding; the CSS Custom Highlight API cannot pad.
- Chrome paints its own selection colour; the design paints a light blue.
- Windows caption buttons and the real window border belong to the OS; the Electron window is captured as page content (1278x798 inside the 1 px border of the design window).
- Live values (versions, latency, token tail, port, memory use) differ from the design's sample numbers.
- The design file is generated art with sample content (Maya, 14 paragraphs, Attention Is All You Need.pdf); the product shows its real data or an empty state.

## Re-run

```
# test build of the extension into apps/extension/dist-visual (leaves dist/ alone)
cd D:/workspaces/speak-it/code/e2e/visual && sh rebuild.sh
# desktop, when its sources changed
cd ../../apps/desktop && pnpm exec vp build
# capture and diff (ONLY=A1,B6 ids, GROUP=popup,page,reader,options,side,desktop,voices,tray,errors, THEME=dark|light, STATE=slug; partial runs merge into results.json)
cd ../../e2e/visual && pnpm exec vp test run
# rebuild designs/built (shots, design crops, review.html) and this file
node report.mjs
```

Outputs in `code/e2e/visual/out`: `built` (`<id>-<state>-<theme>.png`), `design` (design crops), `diff` (pixelmatch), `sbs` (design, built and diff side by side; tall screens stack design over built), `results.json`. `notes.json` holds per-screen verdict overrides and reasons (key `<id>-<state>-<theme>`), `missing-reasons.json` the reason for each design frame that is not captured.
