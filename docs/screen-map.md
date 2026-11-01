# SpeakKit screen map to Lumen frames (2026-11-01)

Lumen frame ids refer to `Lumen ... .figcraft`; details and measurements are in `lumen-study-2.md`, images in `lumen-study-frames/`. "F5" is the browser-feature frame (reader mode + read-aloud pill + reading popover, page 45134, studied in `lumen-study.md`). SpeakKit titles are in `designs/manifest.json`.

## Mapping

| SpeakKit ids | Lumen closest frame | Adopt |
|---|---|---|
| A1-A5, A12 (popup idle, selection, preparing, playing, paused, dark) | D1 41331 side-panel structure; TR1 29857 tray panel (compact card: header icons, task rows with state icons, footer actions); F5 pill | Popup = header (logo, name, gear, expand), one now-playing row with state icon (spinner / play / check), primary round button 40 px, speed and voice as pills, footer line `on device`. Same 13 px type, 12 px secondary lines, radius 10 card, 1 px divider. Status lines name the state in words ("Preparing paragraph 2"). |
| A6, A7 (voice, speed pickers) | CP1 38258 list rows; F5 popover (segmented + rows) | Picker = popover list with caps group labels, 32 px rows, selected fill, check mark; no new panel look. Speed as segmented chips + slider. |
| A8 (finished) | NO1 30080 toast copy; EM1 38466 empty-state card | One sentence + one primary (`Read again`), no illustration; 48 px icon tile. |
| A9, A13 (app not running / not installed) | ES1 37579 (banner cards: engine not responding, offline) | Banner in popup: title = what happened + cause, body = what still works, one primary + one secondary (`Open SpeakKit` / `Download`). Amber for degraded, red for failed. |
| A10 (model loading) | X4 20398 first-launch status list | Checklist with green checks and a blue spinner line, real details (model name, MB). |
| A11 (page not readable) | E1 15714 "file problem" banner | Neutral banner, one action (`Read selection instead`). |
| A14 (token rejected) | BR4 37287 pairing; ES1 "provider key stopped working" | Red banner + `Pair again`; pairing code is 6 boxes. |
| A15 (local file needs permission) | X11 21571 permission row; ES1 "permission revoked" | Banner naming the Chrome setting, one button that opens `chrome://extensions` details. |
| B1-B3 (selection bubble, play gutter, context menu) | F5 (in-page pill); CP1 rows for the menu | Bubble = dark pill, 32 px, icon buttons; context menu = CP1 row style with shortcut hints at right. |
| B4-B8 (dock idle, preparing, reading, paused, finished) | F5 dark pill (prev, 40 px blue play, next, `Paragraph n of N - x min left`, speed pill, voice `on device`, close) | Copy exactly; add `Preparing...` spinner state; finished state replaces text with `Done` + `Read again`. Highlight = soft block on paragraph (F5). |
| B9 (app offline error) | ES1 offline banner; M2 toast spec | In-page banner above dock: "SpeakKit isn't running" + `Open SpeakKit` + `Dismiss`. |
| B10, B12 (reader view, dark) | F5 reader mode + reading popover | Same. |
| B11, B21 (reading dark, launcher dark) | LM1 38544 pairs; dark is default | Keep dark default; generate light twin per LM rules. |
| B13, B14 (added to queue, back to current) | NO1 toast; D1b chip row | Small toast bottom center, 16 px rise, 6 s; `Back to current` as a pill chip. |
| B15, B16 (dock speed and voice popovers) | F5 reading popover; CP1 list | Popover above the dock, `fast` scale 0.96->1; rows 32 px. |
| B17-B20 (edge launcher states) | D3 41796 / D1 41331 toolbar action; V2 43427 collapsed rail (hover expands) | Rail 24 px at the edge, expands on hover (fast, point-to-point), tooltip card for button meanings (D1b). |
| C1-C3 (options general: connected, app not running, token rejected) | SD1 30356 + BR4 37287 | Settings shell: 248 nav, 760 column, caps group labels, 58 px rows. Connection = BR4 card with status pill `Connected`, `Unpair` text button; states = banner at top (ES1 style). |
| C4 (voice and speed) | SD1 rows; ST2 12095 slider row | Rows with select, slider (A..A ends + readout), segmented. |
| C5, C8 (highlighting, dark) | ST2 12095 Appearance | Theme radio cards with previews, accent swatches, segmented density; preview block shows a sample sentence. |
| C6 (shortcuts) | SD6 31796 | Two groups "GLOBAL" and "IN THE BROWSER"; keycap chips; click to record (blue outlined `Press keys...`); conflict banner (X10). |
| C7 (sites and filters) | BR4 SITE PERMISSIONS rows | Domain rows with select (`Always read`, `Ask`, `Never`). |
| C9-C11 (side panel queue/outline, empty, dark) | D1 41331 side panel; D1b 42463; EM1 | 388 px panel as inset card; header with icons; empty state = icon tile + sentence + button. |
| C12 (edge launcher options) | SD1 rows | One group of rows. |
| D1 (welcome) | X4 20398 | Small centered card, icon, "Starting SpeakKit", status list. |
| D2, D3 (choose engine, GPU / no GPU) | X9 21205 | Provider-style rows with status pills, detected-hardware line ("Found NVIDIA ... 8 GB"), defaults group. No-GPU = amber note + CPU recommendation. |
| D4, D5 (downloading, paused) | SD4 31233 storage bar; X4 checklist | Row per model with progress bar, size, `Pause`; paused = amber banner. |
| D6 (connect browser) | BR4 37287; X10 | Numbered steps + 6-box code. |
| D7, D9 (ready: sample / skipped) | X14 22201 | End on the real feature (play a sample) not a summary. |
| D8 (welcome dark) | - | Dark default. |
| E1-E16 (library: empty, list, add, drag, search, menu, delete, toasts, unsupported) | X15/X16 shell (part 1); EM1 empty; MW6 18026 library rows; CP1 search; QT1 30273 confirm dialog; NO1 toast; ES1 file problem | List rows 56 px with state icons; empty = EM1 card; delete confirm = QT1 dialog (what is lost, `Cancel` left, red `Delete` right); toasts = M2 task toast; unsupported file = neutral banner with reason + action; search = title bar field `Ctrl K`. |
| F1-F16 (reader, PDF, settings, sleep timer, search, voice) | F5 reader + pill; BR2 36783 page reader (cited passages highlighted); X15 content card centered 760 | Reader = inset card, text column 760 (or user width), pill dock at bottom, reading popover top right; search in text = in-card find bar; PDF scanned = E1 "Run OCR" banner. Outline = right panel. |
| G1-G16 (voices, cloning, engines) | EH1 38009 hub cards; SD2 30622 models; X9 provider rows; ES1 engine banners | Hub: 4 cards (Engines, Voices, Pronunciation, Sites); engine rows with status pills; GPU memory error = red banner `Use CPU`; cloning steps use the X-stepper pattern inside a modal (EX1 19752 for the consent sheet). |
| H1-H11 (settings) | SD1-SD9 30356-32743 | Same nav groups, rows and controls; H9 update = SD4 + UP1 popover; H4 browser = BR4; H5/H11 shortcuts = SD6; H6 storage = SD4 storage bar; H7 appearance = ST2. |
| I1, I2, I6, I7, I8 (tray menus: playing, idle, dark, loading, error) | TR1 29857 (native menu + own panel) | Native menu short: `Read clipboard`, `Open SpeakKit` / `Pause`, `Do not disturb`, `Settings`, `Check for updates`, `Quit`. Icon states: normal, working (animated), needs you (orange dot), paused (grey). Add left-click panel (now playing, next in queue). |
| I3, I9 (mini player, states) | M4 43116 voice pill storyboard; F5 pill | 36 px pill, spring width, stop never moves, shrinks to a dot after quiet. |
| I4 (global shortcut toast) | NO1 30080 | Toast with `SpeakKit` header, title, body, hint line. |
| I5 (clipboard prompt) | NO1 + TR1 panel | Toast "Copied text: read it?" (click opens). No buttons (Windows toast rule). |
| J1-J7 (export) | Web share & export section 11115 (not rendered here); X13/X10 rows; UP1 progress card | Options as a dialog with rows; rendering = progress card with bar; background export = tray row with spinner; done = toast. |
| K1, K9, K10 (engine crashed, repairing) | ES1 "engine not responding"; UP1 progress card | Banner or dialog: "SpeakKit's engine stopped. Your readings are saved." + `Restart engine` + `Send crash report`. |
| K2, K7 (port in use, already running) | ES1 "shortcut taken"; X4 | Banner with the port and `Choose port`; "already running" = focus existing window + toast. |
| K3 (low disk) | ES1 "disk almost full" | `Clear cache` primary, `Manage storage`. |
| K4 (checksum failed) | ES1 pattern | Red banner, `Download again`. |
| K5 (extension out of date) | UP1 popover tone | Amber notice with `Update extension`. |
| K6 (microphone blocked) | X11m 21737 permission rows; ES1 "permission revoked" | Row with status + `Open System Settings`. |
| K8 (offline) | ES1 offline | "You're offline. Reading on this computer still works." |

## Lumen patterns SpeakKit has no screen for (add)

| Pattern | Lumen frame to copy | SpeakKit use |
|---|---|---|
| Global search / command palette | CP1 38258 + title-bar search (X15) | `Ctrl K` palette: readings, voices, actions ("Read clipboard", "Pause"), settings. Needs frame `CP1`. |
| Status pill in the title bar | X15/X16, UP1 30170 (`Update ready - 1.1.0`) | `Reading 3 of 14` / `Downloading model 42%` / `Update ready`. |
| Notifications settings table (event x Toast, Bell, Sound) + Do not disturb | SD7 32102 | Events: reading finished, export done, model download done, engine error, update ready. |
| Notification toasts (Windows) | NO1 30080 | Export complete, clipboard read, engine problem; rules card included. |
| Updates popover + "Updating..." card + "install when I quit" | UP1 30170, SD4 31233 | New screen; H9 only covers the settings row. |
| Quit confirmation | QT1 30273 | "Quit SpeakKit? 1 reading is playing and 2 exports are rendering." |
| Tray left-click panel with state icons | TR1 29857, TR2 29994 | Part of I1 family but missing the panel; add I10 panel. |
| macOS menu bar variant | TR2 29994 | Only if macOS ships; mark LATER. |
| Edge-state board | ES1 37579 | One board with 12 cases (replaces scattered K-frames; keep K-frames as detail). |
| Empty-states board | EM1 38466 | Library, queue, voices, exports, notifications. |
| First-launch status screen | X4 20398 | D1 variant before onboarding starts. |
| Setup window with 5-step stepper | X9-X13 | D2-D9 should share one window + stepper + footer. |
| Shortcut conflict banner + recording chip | X10 21387 | C6, H5, H11: add conflict case. |
| Background / start-at-sign-in step | X13 22050 | Startup toggles ("Start SpeakKit when I sign in", "Closing the window keeps it in the tray"). |
| Extension pairing code (6 boxes) | BR4 37287 | D6, A14, C1-C3. |
| Per-site permission list | BR4 site permissions | C7. |
| Extension consent sheet | EX1 19752 | Voice pack / engine install consent ("It will be able to / It can't"). |
| Reading settings popover and reader mode | F5 | B10-B12, F7: confirm both exist; popover is part of the pill spec. |
| Storage bar with per-category sizes | SD4 31233 | H6. |
| Settings search field in title bar | SD1 | H-series. |
| Light-mode frames | LM1 38544, LM3 38759 | Light twins for popup (A), dock (B), settings (H), library (E). |
| Motion spec board | M1 42670, M2 42783 | New page `Motion` with token and per-interaction tables. |
| Breakpoint rules card | 18218 | Options page and desktop window below 1025 px. |
| Voice/level meter + pill storyboard | M4 43116 | I3/I9 storyboard. |
| Annotation "rules" cards inside frames | TR1, NO1, TR2 | Add a rules card to I, K and B frames. |
