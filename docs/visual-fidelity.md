# Visual fidelity

Built UI compared with the restructured designs in `designs/next` (`screens/<ID>.png`, `manifest.json`, Lumen structure; dark is the default theme, light twins carry the `-L` suffix). The harness in `code/e2e/visual` drives the real extension (Chromium, MV3, test build), the real SpeakKit server with the fake engine and the real Electron app, captures every state in dark and light, diffs each capture against its design crop with pixelmatch and looks at the side-by-side images. `node report.mjs` copies the screenshots to `designs/built` and builds `designs/built/review.html` (the review page: one horizontally scrolling row per feature group, approve / change / reject with notes, light and dark per card, optional design beside the screenshot, lightbox).

**Counts:** 174 screens captured (174 images, light) against 236 design frames. Diffed against a design frame: 121 images: 30 match, 68 minor drift, 19 drift, 4 known difference. 120 design frames could not be captured (list below).

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


## Screens captured per feature group

| Group | Screens | Images |
|---|---|---|
| Extension popup | 23 | 23 |
| On-page reading | 32 | 32 |
| Reader view | 4 | 4 |
| Options | 17 | 17 |
| Side panel (queue) | 5 | 5 |
| Desktop setup | 8 | 8 |
| Desktop home and shell | 7 | 7 |
| Desktop library | 15 | 15 |
| Desktop reader and export | 18 | 18 |
| Voices and engines | 6 | 6 |
| Desktop settings | 12 | 12 |
| Tray, notifications and system states | 24 | 24 |
| Errors and edge states | 3 | 3 |

## Results

Diff % is pixelmatch (threshold 0.2) of the built screenshot against the design crop at 1x, as a share of the compared area. match <= 4 %, minor drift <= 10 %, drift above that.

| ID | Screen | Theme | Result | Diff % | Reason |
|---|---|---|---|---|---|
| A1 | Popup · idle on an article | light | minor drift | 8.11 | Idle: Listen, From selection, Reader view and the hint line sit 2 to 5 px lower than the design. Header, now-playing row, scrubber, voice row, shortcuts and footer follow the design within about 2 to 4 px (360 px card). Remaining differences: settings glyph is the vertical sliders icon (design: horizontal), Play / pause shortcut shows Ctrl Shift Y (design: P), buttons in error states carry no leading icon. |
| A2 | Popup · selection ready | light | minor drift | 11.23 | Selection quote and Listen to selection button; same drift as A1. |
| A3 | Popup · preparing audio | light | minor drift | 5.31 | Preparing bar and Cancel match; spacing differs by 2 to 4 px. |
| A4 | Popup · playing | light | minor drift | 5.24 | Playing: transport (52 px play, 28 px skips) and times within 2 px after the fix; skip glyphs are slightly smaller than the design. Header, now-playing row, scrubber, voice row, shortcuts and footer follow the design within about 2 to 4 px (360 px card). Remaining differences: settings glyph is the vertical sliders icon (design: horizontal), Play / pause shortcut shows Ctrl Shift Y (design: P), buttons in error states carry no leading icon. |
| A5 | Popup · paused | light | minor drift | 5.25 | Paused: same as A4. |
| A6 | Popup · voice picker | light | drift | 5.08 | Voice picker: product has an extra Voice filter chip and a filled accent row for the selected voice, the scrubber row is not compacted, the list shows 5 rows (design 4 with scrollbar). |
| A7 | Popup · speed picker | light | minor drift | 5.46 | Speed picker: presets and slider match in structure (not viewed side by side). |
| A8 | Popup · finished | light | minor drift | 6.49 | Finished: replay button and Up next card match in structure; the Up next title truncates in the product (design wraps), voice row sits 20 px lower. |
| A9 | Popup · app not running | light | minor drift | 8.62 | Offline: icon tile, title and body match; the two buttons have no leading icons. |
| A10 | Popup · model loading | light | minor drift | 5.33 | Loading bar and wording (not viewed side by side). |
| A11 | Popup · page not readable | light | minor drift | 6.92 | Cannot read this page: tile has no amber tint and the button has no leading clipboard icon; text and layout match. |
| A13 | Popup · app not installed | light | minor drift | 8.4 | Not installed: same layout as A9 (not viewed side by side). |
| A14 | Popup · pairing token rejected | light | minor drift | 8.92 | Token rejected: same layout as A9 (not viewed side by side). |
| A15 | Popup · local file needs permission | light | minor drift | 6.73 | File permission: same layout as A9 (not viewed side by side). |
| A16 | Popup · engine asleep | light | drift | 8.29 | Engine asleep: the design shows an Engine asleep chip and a message block (Voice engine is asleep, memory given back). The product shows a Wakes on play chip and one hint line under the Listen button; that string is asserted by the e2e lifecycle test, so it was left as is. |
| A17 | Popup · waking the engine | light | minor drift | 5.33 | Waking: indeterminate bar and wording follow the design (not viewed side by side). |
| B1 | Page · selection bubble | light | minor drift | 9.21 | Bubble sits about 4 px off and shows the shortcut hint in its tooltip; Chrome paints its own selection colour (design: light blue); Listen has an icon gap. |
| B2 | Page · paragraph play gutter | light | minor drift | 4.93 | Gutter play button and paragraph tint match (not viewed side by side). |
| B4 | Page · pill idle | light | minor drift | 5.34 | Idle pill. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B5 | Page · pill preparing | light | minor drift | 5.45 | Preparing pill. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B6 | Page · reading with highlight | light | minor drift | 5.67 | Reading with highlight: article, sentence and word highlight match. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B7 | Page · paused | light | minor drift | 5.68 | Paused pill. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B8 | Page · finished | light | minor drift | 5.49 | Finished pill. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B9 | Page · app offline error | light | minor drift | 5.61 | Offline error pill. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B22 | Page · pill, engine asleep (product shows the plain idle pill) | light | drift | 5.34 | The idle dock says Engine asleep and wakes on play, and the edge pill tooltip says Wakes on play; the design draws an asleep label on the pill itself. |
| B23 | Page · pill, waking the engine | light | minor drift | 5.48 | Waking label appears after 1.2 s of preparing. Pill is the Lumen read-aloud pill: it has two extra buttons next to play (previous and next paragraph, more menu), the voice chip shows an avatar where the design draws a speaker glyph, and the progress label counts the fixture's 4 paragraphs (design: 14). |
| B13 | Page · added to queue | light | minor drift | 8.62 | Toast text and View queue action match; toast sits 6 px higher; selection colour differs. |
| B14 | Page · back to current | light | minor drift | 3.47 | Back to current pill matches; the article behind it is the shorter fixture. |
| B15 | Page · speed popover | light | minor drift | 5.2 | Speed popover above the pill (not viewed side by side). |
| B16 | Page · voice popover | light | minor drift | 5.78 | Voice popover: search, rows and preview buttons match; the first row shows the keyboard focus ring. |
| B11 | Page · reading on a dark site | light | drift | 19.86 |  |
| B17 | Page · edge launcher, hidden tab | light | minor drift | 4.93 | Edge tab 14 px at the right edge (not viewed side by side). |
| B18 | Page · edge launcher, open on hover | light | minor drift | 6.03 | The design frame is superseded by the pill (B4); the product still has the edge launcher. |
| B19 | Page · edge launcher, reading | light | minor drift | 5.24 | Edge tab while reading; tab position matches. |
| B20 | Page · edge launcher, reading expanded | light | minor drift | 6.75 | The design frame is superseded by the pill (B6); the product still has the expanded launcher. |
| B10 | Page · reader view (paper) | light | drift | 4.37 | Reader view: the product has a top bar (close, host, settings) and no kicker or subtitle, the design is an inset card with the pill visible and the reading panel open. The duplicate page title is removed (is-dup) and the pill is now above the reader. |
| B24 | Page · reading settings popover | light | drift | 4.47 | Reading panel: title and highlight label now follow the design (Reading, Highlight sentence); the product uses sliders for size and width and a Paper / Light / Dark segmented control, the design shows value rows (19, Medium, Paper). |
| C1 | Options · General (connected) | light | match | 3.39 | Connection card, port and token fields match; version and latency are live values, the token field has reveal and copy buttons. |
| C2 | Options · General (app not running) | light | match | 4.58 | Offline card, alert and buttons within 2 px (not viewed side by side). |
| C3 | Options · General (token rejected) | light | minor drift | 5.13 | Empty focused token field like the design; the design shows a clipboard icon left of the placeholder. |
| C13 | Options · Pair this browser (no token yet) | light | minor drift | 4.6 | No token yet and the app unreachable: the product shows the token field with Re-pair, the design adds a Paste button and Test connection. |
| C4 | Options · Voice and speed | light | match | 3.6 | Voice and speed rows within 2 px (not viewed side by side); the design shows a transient Saved indicator. |
| C5 | Options · Highlighting | light | minor drift | 3.5 | Preview padding differs by 4 px; swatches are 50 px apart as in the design. |
| C6 | Options · Shortcuts | light | minor drift | 2.2 | The product lists 3 Chrome commands read-only; the design lists 4 with a conflict badge and Reset. |
| C7 | Options · Sites and filters | light | match | 3.59 | Site rule rows (not viewed side by side); rows are sorted alphabetically in the product. |
| C15 | Options · Sites not in the list (default for other sites) | light | match | 3.39 |  |
| C16 | Options · Shortcut not assigned by Chrome | light | match | 3.67 |  |
| C12 | Options · Edge launcher | light | match | 2.84 | Launcher options within 2 px. |
| C18 | Options · Narrow layout | light | minor drift | 4.69 | Below 1025 px the nav collapses to a select at the top and padding is 20 px like the design; the design page content is a shorter General (Launcher card), the product keeps its connection and appearance cards. |
| C9 | Side panel · queue and outline | light | minor drift | 5.71 | Side panel: now-playing card is tinted like the design, outline row and Up next cards match after the CSS changes; transport icons are 2 px smaller. |
| C10 | Side panel · empty queue | light | minor drift | 4.18 | Empty state centred; the design tile is 52 px with a round border, the text is one line shorter. |
| W1 | Setup 1 · Welcome | light | drift | 4.05 | Welcome: product hero (Read anything out loud, three cards) against the design's left-aligned list. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| W2 | Setup 2 · Voice engine | light | drift | 3.94 | Voice engine: Kokoro selected, Chatterbox locked; no hardware detection banner. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| W3 | Setup 3 · Download | light | drift | 3.71 | Download: one model row with progress; the design lists model, voices and runtime rows. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| W3b | Setup 3 · Download paused (product: failed with Retry) | light | drift | 3.79 | Download failed: error banner with details and Retry; the design shows a paused download. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| W4 | Setup 4 · Connect browser | light | drift | 5.14 | Connect browser: three numbered steps with reveal, copy and test; the design shows the pairing code flow. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| W5 | Setup 5 · Done | light | drift | 4.86 | Done: sample player and settings rows. Setup window follows the earlier D-series layout (hero welcome, card steps) while the restructured W-series shows a left-aligned column with a stepper; step names, buttons and flow are the same. |
| L1 | Home | light | known difference | 3.81 | Home: the design is a library home (greeting, composer, reading now, continue list), the product Home shows server, engine, pairing token and extension install (Library is v1.1). Title bar, search, sidebar, New reading button and engine card match. |
| L2 | Command palette | light | minor drift | 12.42 | Command palette: 640 px, grouped rows, footer hints; groups and items differ (design lists readings). |
| L3 | Command palette (filtered) | light | minor drift | 9.15 | Filtered palette; same as L2. |
| L4 | Narrow window (rail) | light | minor drift | 4.08 | 60 px rail below 1025 px (not viewed side by side). |
| E1 | Library · empty | light | match | 3.14 | size design 1278x798 built 1278x799 |
| E2 | Library · with readings | light | match | 2.93 | size design 1278x798 built 1278x799 |
| E7 | Library · search results | light | match | 3.42 | size design 1278x798 built 1278x799 |
| E8 | Library · no search results | light | match | 3.6 | size design 1278x798 built 1278x799 |
| E10 | Library · delete confirmation | light | minor drift | 8.33 | size design 1278x798 built 1278x799 |
| E3 | Add · paste text | light | drift | 13.36 | size design 1278x798 built 1278x799 |
| E4 | Add · web address, fetching | light | minor drift | 8.93 | size design 1278x798 built 1278x799 |
| E5 | Add · web address failed | light | drift | 10.54 | size design 1278x798 built 1278x799 |
| E6 | Library · dragging a file | light | match | 2.59 | size design 1278x798 built 1278x799 |
| E14 | Library · dragging several files (the product shows the same overlay for one or many) | light | match | 2.59 | size design 1278x798 built 1278x799 |
| E15 | Library · unsupported file | light | match | 3.23 | size design 1278x798 built 1278x799 |
| E9 | Library · row menu | light | match | 3.12 | size design 1278x798 built 1278x799 |
| E16 | Library · delete pasted text | light | minor drift | 8.28 | size design 1278x798 built 1278x799 |
| E13 | Library · added toast | light | match | 3.26 | size design 1278x798 built 1278x799 |
| F1 | Reader · playing | light | minor drift | 5.52 | size design 1278x798 built 1278x799 |
| F2 | Reader · paused | light | minor drift | 5.03 | size design 1278x798 built 1278x799 |
| F6 | Reader · outline and bookmarks | light | minor drift | 5.36 | size design 1278x798 built 1278x799 |
| F9 | Reader · voice popover | light | minor drift | 5.23 | size design 1278x798 built 1278x799 |
| J1 | Export · options | light | drift | 13.58 | size design 1278x798 built 1278x799 |
| F3 | Reader · preparing next paragraph | light | minor drift | 5.52 | size design 1278x798 built 1278x799 |
| F4 | Reader · finished | light | drift | 14.75 | size design 1278x798 built 1278x799 |
| F5 | Reader · read from here | light | match | 3.3 | size design 1278x798 built 1278x799 |
| F7 | Reader · display settings | light | match | 3.09 | size design 1278x798 built 1278x799 |
| F8 | Reader · sleep timer | light | match | 2.73 | size design 1278x798 built 1278x799 |
| F15 | Reader · back to current | light | minor drift | 6.25 | size design 1278x798 built 1278x799 |
| F16 | Reader · search in text | light | minor drift | 8.3 | size design 1278x798 built 1278x799 |
| F10 | PDF reader · playing | light | minor drift | 4.21 | size design 1278x798 built 1278x799 |
| F11 | PDF reader · scanned page | light | match | 3.15 | size design 1278x798 built 1278x799 |
| F11 | PDF reader · scanned page, consent to recognize | light | drift | 79.74 | size design 1278x798 built 1278x799 |
| J5 | Export · file exists | light | minor drift | 8.91 | size design 1278x798 built 1278x799 |
| F13 | PDF reader · recognizing text (language data still loading) | light | match | 2.47 | size design 1278x798 built 1278x799 |
| F13 | PDF reader · recognition stopped, nothing recognized | light | match | 2.69 | size design 1278x798 built 1278x799 |
| G1 | Voices · library | light | known difference | 4.44 | Voices: the design adds Your voices, voice cloning, Grid / List and a grades legend (cloning is v1.1); the product has search, filters and quality-graded cards. |
| G8 | Engines · overview | light | known difference | 2.32 | Engines: the design shows a hardware banner, model sizes and a Chatterbox download; the product lists Kokoro and a locked Chatterbox. |
| O2 | Engines · unloaded | light | drift | 2.59 | Unloaded: the product shows the unloaded pill and card text; the design adds a Load now button and memory stats. |
| O3 | Engines · loading | light | minor drift | 2.39 | Loading state card (not viewed side by side). |
| H1 | Settings · General | light | known difference | 1.94 | General: the design groups Startup, Interface language, Privacy and prompts (clipboard, crash reports, updates); the product has launch at login, start minimized, language, theme and notifications. |
| H2 | Settings · Voice and playback | light | minor drift | 1.19 | Voice and playback rows (not viewed side by side). |
| H4 | Settings · Browser integration | light | minor drift | 2.08 | Port, token and pairing status; the design lists paired browsers. |
| H12 | Settings · Memory | light | minor drift | 2.13 | Memory: idle unload choices, load at startup, battery saver and live RAM match the design; the design adds CPU threads and GPU fallback rows. |
| H13 | Settings · Memory (engine unloaded) | light | minor drift | 2.32 | Memory with the engine unloaded (not viewed side by side). |
| H6 | Settings · Storage | light | minor drift | 2.11 | Storage: models folder and size bar (not viewed side by side). |
| H8 | Settings · About | light | minor drift | 2.7 | About: versions and licenses (not viewed side by side). |
| H5 | Settings · Shortcuts | light | match | 1.85 | size design 1278x798 built 1278x799 |
| H14 | Settings · Notifications | light | match | 2.51 | size design 1278x798 built 1278x799 |
| H11 | Settings · Shortcuts, recording a key | light | match | 2.02 | size design 1278x798 built 1278x799 |
| H16 | Settings · Shortcuts, conflict | light | match | 2.21 | size design 1278x798 built 1278x799 |
| H9 | Settings · Update available (release page, the copy cannot replace itself) | light | match | 3.17 | size design 1278x798 built 1278x799 |
| K11 | Quit confirmation | light | minor drift | 10.25 | Quit dialog: the product lists what stops (server, model); the design lists reading and exports (exports are v1.1). |
| H18 | Update ready · pill | light | match | 3.66 | size design 1278x798 built 1278x799 |
| H18 | Update ready · popover | light | minor drift | 4.11 | size design 1278x798 built 1278x799 |
| H19 | Updating | light | match | 2.58 | size design 1278x798 built 1278x799 |
| J2 | Export · rendering | light | minor drift | 9.97 | size design 1278x798 built 1278x799 |
| J3 | Export · done | light | minor drift | 9.66 | size design 1278x798 built 1278x799 |
| J6 | Export · in background | light | minor drift | 4.04 | size design 1278x798 built 1278x799 |
| J7 | Notifications bell · after an export | light | minor drift | 4.07 | size design 1278x798 built 1278x799 |
| K11 | Quit confirmation · a reading and an export running | light | drift | 13.37 | size design 1278x798 built 1278x799 |
| H18 | Update ready · restart while a reading is playing | light | match | 3.92 | size design 1278x798 built 1278x799 |
| K2 | Notice · port in use (the app falls back to another port) | light | minor drift | 4.02 | The app picks another port and shows a warning banner on Home; the design shows a blocking error card. |
| K1 | Error · engine could not start (home) | light | minor drift | 3.86 | Engine error: banner with Retry on Home (not viewed side by side). |

## Not captured

| ID | Design screen | Reason |
|---|---|---|
| R1 | Feature map (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| R2 | Surfaces (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| R3 | First read in four steps (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| R4 | Resource lifecycle (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| R5 | Lockix patterns adopted (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| R6 | Decisions that shape the UI (Research & feature map) | Research board: documentation of the feature map, flows and Lumen patterns, not a product screen. |
| A23 | Popup · playing with a selection on the page (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| A21 | Popup · downloading the voice model (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| A20 | Popup · no voice engine installed (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| A22 | Popup · voice engine error (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| A18 | Popup · app and extension versions differ (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| A19 | Popup · Chrome's PDF viewer (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B25 | Page · pill, token rejected (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B26 | Page · pill, engine not ready (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B27 | Page · pill, synthesis failed (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B28 | Page · pill, page not readable (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B35 | Page · pill idle on a dark site (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B3 | Page · context menu (Chrome extension) | Native Chrome context menu: headless Chromium does not render it and Playwright cannot screenshot it. The entries the background worker registers are Speak Kit > Read selection, Read from here, Add to queue (asserted in the e2e suite). |
| B29 | Page · paragraph gutter while reading (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B30 | Page · error toast (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B31 | Page · info toast (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B33 | Page · pill more menu (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B34 | Page · reader view, light (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B32 | Page · reader view, theme dark requested (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| B21 | Page · edge launcher reading on a dark site (Chrome extension) | Superseded by B4; the pill replaced the edge launcher expanded state. Dark launcher is covered by B17-B20. |
| B36 | Page · edge launcher tab on a dark site (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C21 | Options · Voice and speed (app not running) (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C22 | Options · Highlighting (dark page preview) (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C19 | Options · Reader view (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C20 | Options · Sites and filters (no rules yet) (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C23 | Options · Edge launcher (turned off) (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C14 | Open Speak Kit link flow (Chrome extension) | The Open Speak Kit link (speakkit://) hands over to the operating system protocol handler; no page of the product is drawn for it. |
| C24 | Side panel · outline without a queue (Chrome extension) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| C17 | Breakpoint rules (Chrome extension) | Rule card (breakpoint rules), not a screen. The collapsed layout it describes is captured as C18. |
| W0 | First launch (Desktop app) | First-launch splash frame of the design: the product opens straight on the Welcome step (W1), there is no separate splash window. |
| W2b | Setup 2 · Voice engine (GPU found) (Desktop app) | Implemented: the wizard shows the detected GPU or says none was found. The harness machine has a GPU, so the no-GPU state is not reachable without hardware detection being faked. |
| W4b | Setup 4 · Token revealed and copied (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| W5b | Setup 5 · Done (browser skipped) (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| L5 | Sidebar hidden (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| L6 | New reading (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| L7 | Notifications (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| E12 | Library · deleted toast (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| F14 | Reader · voice panel (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| F12 | PDF reader · recognize text consent (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| F17 | PDF reader · recognition failed (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| G2 | Voices · detail drawer (Desktop app) | Voice detail drawer is not built; the Voices page lists voices with a preview button only. |
| G13 | Voices · list view (Desktop app) | List/grid view toggle for voices is not built (one list layout). |
| G17 | Engines · Chatterbox not installed (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| G9 | Engines · Chatterbox installing (Desktop app) | Needs an installed Chatterbox engine, which the fake-engine harness cannot show; verified by hand on a GPU (docs/perf.md). |
| G10 | Engines · error (Desktop app) | Needs an installed Chatterbox engine; the product's engine error page is captured as G10 / engines-error without a diff. |
| G16 | Engines · Chatterbox ready (Desktop app) | Needs an installed Chatterbox engine, which the fake-engine harness cannot show; verified by hand on a GPU (docs/perf.md). |
| G18 | Engines · remove confirmation (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| G3 | Clone · choose reference (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G4 | Clone · recording (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G5 | Clone · analyzing (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G6 | Clone · name and test (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G7 | Clone · bad reference (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G15 | Clone · review take (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G11 | Chatterbox · voice style (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| G14 | Voices · cloning unavailable (Desktop app) | Built since the last harness run (docs/scope.md, ADR 0017); no screenshot baseline yet, covered by `apps/desktop/tests/cloning.test.ts`. |
| H3 | Settings · Pronunciation (Desktop app) | Pronunciation dictionary is not built. |
| H17 | Command palette (filtered) (Desktop app) | Settings search is not built; the title bar search opens the command palette (L2, L3). |
| H21 | Browser · pair your browser (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| H20 | Home · engine unloaded (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| H15 | Settings · General (Desktop app) | Launch at login and start minimized are rows inside Settings > General in the product (H1). |
| H7 | Settings · General (Desktop app) | Appearance (theme, language) is part of Settings > General in the product (H1). |
| H23 | Settings · Update ready (pill) (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| H22 | Update ready · restart confirm (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| O1 | Engine states · board (Desktop app) | Board of all engine states side by side (1920 px wide), not a product screen; its states are captured as O2, O3 and H12 and H13. |
| I10 | Tray panel · reading (Desktop app) | The left-click panel is captured as I10 / tray-panel in the app (no diff). The native tray menu is an Electron menu and cannot be screenshotted. |
| I14 | Tray panel · idle (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I15 | Tray panel · paused (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I16 | Tray panel · engine unloaded (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I17 | Tray panel · engine loading (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I18 | Tray panel · model downloading (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I19 | Tray panel · engine error (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I11 | Tray right-click menu (Desktop app) | Tray icon states are drawn into the operating system tray and are not part of any window. |
| I3 | Mini player · playing (Desktop app) | Captured as I3 / mini-player in the app (the mini window), compared by eye: it is a small always-on-top window, not a design-sized frame. |
| I9 | Mini player · paused (Desktop app) | The mini player states other than reading are not captured; the sleep-timer overflow menu is not built. |
| I20 | Mini player · preparing (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I21 | Mini player · error (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I13 | Mini player · finished (Desktop app) | Out of scope: the mini player closes itself 6 s after finishing, it does not shrink to a dot. |
| I1 | Tray menu · playing (Desktop app) | SUPERSEDED by I10; the newer frame is captured instead. |
| I2 | Tray menu · idle (Desktop app) | SUPERSEDED by I10; the newer frame is captured instead. |
| I7 | Tray menu · engine loading (Desktop app) | SUPERSEDED by I11; the newer frame is captured instead. |
| I8 | Tray menu · engine error (Desktop app) | SUPERSEDED by I11; the newer frame is captured instead. |
| I12 | Windows toasts · system (Desktop app) | Windows toasts are shown by the operating system; Playwright cannot capture them (notification content is unit-tested in notify-rules.test.ts). |
| I22 | Windows toasts · reading and export (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I5 | Clipboard prompt (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I23 | Notifications bell · empty (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I24 | Notifications bell · entries (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| I4 | Global shortcut toast (Desktop app) | Implemented (main/toasts.ts); the shortcut toast is an OS notification and cannot be screenshotted. |
| K13 | Quit confirmation · reading and export running (Desktop app) | Implemented in v0.3.0 (docs/scope.md) but not captured by the harness yet. |
| K10 | Error · repairing model (Desktop app) | Model repair screen is not built. |
| K3 | Error · low disk space (Desktop app) | Low disk space check is not built. |
| K4 | Error · model checksum failed (Desktop app) | Model checksum failure screen is not built (download errors show the Retry banner, captured as W3b). |
| K5 | Notice · extension out of date (Desktop app) | Extension out-of-date notice is not built. |
| K6 | Permission · microphone blocked (Desktop app) | Microphone permission is not requested in v1 (no recording). |
| K7 | Notice · already running (Desktop app) | A second launch focuses the running window (single-instance lock, checked by scripts/smoke-packaged.mjs); no screen is drawn for it. |
| K8 | Notice · offline (Desktop app) | Offline notice is not built: everything runs locally and only the model download needs a network (error banner in W3b). |
| K12 | Edge-state board (Desktop app) | Board of edge states (2560 px wide), not a product screen; its single cases are captured individually where they exist. |
| E17 | Empty-state board (Desktop app) | Board of empty states (2320 px wide), not a product screen. |
| D1 | Welcome (Desktop app) | SUPERSEDED by W1; the newer frame is captured instead. |
| D2 | Choose engine (GPU found) (Desktop app) | SUPERSEDED by W2; the newer frame is captured instead. |
| D3 | Choose engine (no GPU) (Desktop app) | SUPERSEDED by W2b; the newer frame is captured instead. |
| D4 | Downloading models (Desktop app) | SUPERSEDED by W3; the newer frame is captured instead. |
| D5 | Download paused (Desktop app) | SUPERSEDED by W3b; the newer frame is captured instead. |
| D6 | Connect your browser (Desktop app) | SUPERSEDED by W4; the newer frame is captured instead. |
| D7 | Ready: hear a sample (Desktop app) | SUPERSEDED by W5; the newer frame is captured instead. |
| D9 | Ready: extension skipped (Desktop app) | SUPERSEDED by W5; the newer frame is captured instead. |
| Q1 | Tokens (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q2 | Icon set (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q3 | Components and states (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q4 | Desktop components (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q5 | Extension components (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q6 | Elevation (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| Q7 | Platform radii (Foundations & components) | Foundations board: tokens, icons and component sheets, not a product screen (tokens and components are verified through the kit gallery in packages/ui). |
| MO1 | Motion tokens (Motion) | Motion board: motion tokens and rules, not a product screen. |
| MO2 | Per-element rules (Motion) | Motion board: motion tokens and rules, not a product screen. |
| MO3 | Reduce motion and principles (Motion) | Motion board: motion tokens and rules, not a product screen. |
