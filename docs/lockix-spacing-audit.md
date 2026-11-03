# Lockix spacing and radius audit

Date: 3 Nov 2026. Reference: `docs/lockix-design-system.md` and the Lockix source (`apps/desktop/src/renderer/styles.css`, `components/shell/*`, `pages/settings/settings.parts.tsx`, `docs/desktop.md` "Windows radii"). Light only.

Measured values come from `apps/desktop/tests/spacing.test.ts` (Electron, Windows, so `data-platform="win32"`), `packages/ui/tests/browser.test.ts` (Chromium, kit markup) and `e2e/tests/ui.spec.ts` (extension in-page container). "Before" values for the shell were measured on the build before this change. Where a "Before" is marked `css`, it is the declared fixed pixel value in the CSS before the change (the same number the browser computes). Values the kit and the apps share are now tokens in `packages/ui/src/lumen.css` (`--bar-h`, `--panel-inset`, `--page-pad-top`, `--page-pad-x`, `--page-pad-bottom`, `--page-gap`, `--card-pad-y`, `--card-pad-x`); Lockix has none (Tailwind steps), so these are Speak Kit's names for the Lockix numbers.

## Radius per platform

One rule, in `lumen.css`: macOS values are the `:root, :host` defaults, `[data-platform="win32"]` overrides them. Linux uses the macOS values (Lockix has no Linux rule).

| Token | macOS / Linux | Windows | Used for |
| --- | --- | --- | --- |
| panel | 14 | 8 | main content panel |
| tray | 14 | 10 | tray panel window |
| window | 12 | 10 | mini player, update card, reader finished card, in-page popover surface |
| dialog | 16 | 10 | dialogs, command palette |
| card | 10 | 10 | cards, list rows, panel inner card |
| menu | 10 | 10 | menus, popovers, select lists |
| control, track, item, menu-item | 8 | 8 | buttons, inputs, selects, rail and nav items, selected rows |

Where `data-platform` is set, so there is no frame with the wrong radius:

| Surface | How |
| --- | --- |
| Every desktop window (main, mini player, tray panel) | `src/preload/platform-attr.ts`, called from the preload that `createSecureWindow` gives every window; sets the attribute on `<html>` as soon as the element exists (a `MutationObserver` covers a preload that runs earlier), before the first paint. `App.tsx` still sets it from `AppState.platform`. |
| Extension popup, options, side panel | `main.tsx` sets it on `<html>` from `browserPlatform()` (`navigator.userAgentData?.platform`, else `navigator.platform`) before React renders |
| Extension in-page UI | `ShadowShell` puts it on the `.lm.sk` container inside the shadow root |
| Electron window shapes | Mini player and tray panel are transparent frameless windows (`FLOAT_PAD` 24 of shadow room); the card inside draws the radius, so the window needs no `roundedCorners`. The main window is a native frame (`titleBarStyle: "hidden"`): the OS rounds it (Windows 11 8, macOS 10 or 12 by version), and the panel inside it follows the table above. There are no renderer windows for notifications: they are native OS notifications. |

Extension size: `content.js` 13198 bytes gzip before and after (the shell sits in `content-ui.js`: 27071 before, 27185 after, budget 30 KB); popup 125729 before, 125838 after (budget 123 KB = 125952 bytes, 114 bytes of room left).

Tests: `packages/ui/tests/browser.test.ts` (variables and a dialog's computed radius for darwin, no attribute and win32), `apps/extension/src/lumen-subset.test.ts` (the in-page subset carries both blocks; `browserPlatform`), `e2e/tests/ui.spec.ts` (in-page container attribute and computed `--radius-window`), `apps/desktop/src/preload/platform-attr.test.ts`, `apps/desktop/tests/spacing.test.ts` (computed radii of the panel, palette dialog, menu, mini player, tray panel under win32).

## Spacing

Lockix is the reference. "n/a" means Speak Kit has no equivalent surface, so there is nothing to compare.

### Desktop shell

| Surface | Lockix | Speak Kit before | Speak Kit after |
| --- | --- | --- | --- |
| Title bar height | 36 | 40 | 36 (`--bar-h`; `titleBarOverlay` height 36 too) |
| Title bar left padding (first control from the edge) | 8 | 12 | 8 |
| Search box height (small field) | 28 | 30 | 28 |
| Setup window bar | 32, logo 20 tile, 6 from the left and the top | 32, logo 16, 12 from the left, 8 from the top | 32, logo 20, 6 and 6 |
| App title bar logo | 8 from the left and top | none in the bar | n/a (Speak Kit shows no logo there) |
| Nav item height, radius, padding | 36, 8, 0 10 | 36, 8, 0 10 | unchanged |
| Nav item gap (left-panel list) | 2 | 2 | unchanged |
| Sidebar padding (top, right, bottom, left) | rail: 2, 4, 2, 8 | 4, 12, 12, 12 | 2, 4, 4, 8 |
| Sidebar width | rail 48 + left panel 250 | 248 | unchanged (one column replaces both) |
| Collapsed sidebar (window under 1025 px) | rail 48, items 36 | 60, items 44 | 48, items 36 |
| Content panel from the window edge (right, bottom) | 4 | 4, 4 | 4, 4 (`--panel-inset`) |
| Content panel from the title bar | 0 | 0 | 0 |
| Content panel from the sidebar items | 8 (rail 4 + panel 4) | 12 (items end at 236, panel at 248) | 8 (items end at 244, panel at 252) |
| Page header top padding | 22 | 32 | 22 (`--page-pad-top`) |
| Page header to body | 16 (14 + 2) | 24 | 16 (`--page-gap`) |
| Page inset, left and right | 28 | 24 | 28 (`--page-pad-x`) |
| Page bottom padding | 24 | 48 | 24 (`--page-pad-bottom`) |
| Page title | 22 / 26, weight 600 | 22 / 28 | 22 / 26 |
| Page subtitle | 13 / 17, 4 below the title | 13 / 16 | 13 / 17 |
| Page column | 1040 centred | 760 (820 wide) | unchanged (a reading app's narrow column, not a spacing value) |
| Space between settings groups and page sections | 16 | 24 | 16 |
| Card padding (stat, engine row, accent card, pad) | 14 / 16 | 14 / 16, voice card 12, accent card 16 | 14 / 16 (`--card-pad-y`, `--card-pad-x`), voice card 14 |
| Settings row, title only | 42 | 38 (58 with a 36 px control) | 42 |
| Settings row with a description | 58 | 55 | 58 |
| Settings row padding, label, hint | 16 inline, 13.5 / 16, 12.5 / 15 or 17 | 14 inline, 13 / 16, 12 / 15 | 16 inline, 13.5 / 16, 12.5 / 17, 1 between |
| Gap between a row's text and its control | 16 | 10 | 16 |
| List row (card) | 58, padding 0 14, gap 12 | about 60, padding 12, gap 12 | 58, padding 0 14, gap 12 |
| Command palette | dialog radius, 16 | 54 input row, dialog radius | unchanged, radius now 10 on Windows |

### Kit surfaces (already on the Lockix numbers, now pinned)

| Surface | Lockix | Speak Kit before | Speak Kit after |
| --- | --- | --- | --- |
| Dialog padding, gap, footer gap, footer top padding | 16, 14, 8, 6 | 16, 14, 8, 6 | unchanged, pinned |
| Dialog close button | 10 from the top and right | 10, 10 | unchanged |
| Menu padding, item height | 4, 28 | 4, 28 | unchanged, pinned |
| Popover padding | 12 | 12 | unchanged |
| Undo toast | 356 x 52, padding 0 14, gap 12 | 356, min-height 52, padding 8 14, gap 12 | unchanged (padding 8 lets a two-line message grow) |
| Form fields | 36, small 28 | 36, 28 | unchanged, pinned |
| Buttons | 36 / 28 / 24 / 40, padding 14 / 12 / 8 / 18 | same | unchanged |

### Floating windows

| Surface | Lockix | Speak Kit before | Speak Kit after |
| --- | --- | --- | --- |
| Tray window page padding (room for the shadow) | 24 | 18 | 24 (`FLOAT_PAD` and `--float-pad`) |
| Tray window padding | 0 8 8 | 0 8 8 | unchanged |
| Tray window header | 32, logo 20 at 6 from the top and left | min-height 32 plus 8 padding-top (40), logo 18, 12 from the left | 32, logo 20, 6 and 6 |
| Tray window radius | tray (14, Windows 10) | 14 fixed | tray token |
| Notification card, undo-toast family | 356 wide, padding 14, gap 10, 12 above the bottom, 16 from the right | in-app update card: 280, padding 12 14, gap 6, 16 above the bottom | 356, padding 14, gap 10, 12 above the bottom, 16 from the right |
| Notification windows and page padding `10 18 26`, cards 8 apart | as stated | n/a: Speak Kit uses native OS notifications | n/a |
| Mini player | n/a (no Lockix window) | radius 12 fixed, page padding 18 | window token (10 on Windows), page padding 24 |

### Extension

| Surface | Lockix | Speak Kit before | Speak Kit after |
| --- | --- | --- | --- |
| Popup body padding | dialog 16 | 20 16 16 | 16 |
| Popup width, head height | n/a | 360, 52 | unchanged |
| Popup next-up card padding | card 14 / 16 | 10 12 | unchanged: a compact popup chip, not a card |
| Options page padding (top, inline, bottom) | 22, 28, 24 | 32, 32, 64 | 22, 28, 24 (tokens; the narrow-window media rule keeps 20 20 48) |
| Options page section gap | 16 | 24 | 16 |
| Options title and subtitle | 22 / 26, 13 / 17 | 24 / 29, 6 gap | 22 / 26, 13 / 17, 4 gap |
| Options connection card padding | 14 / 16 | 14 | 14 / 16 |
| Options nav panel from the edge | 4 | 4 | unchanged |
| Options rows | 42 / 58 | kit rows (38 / 55) | kit rows (42 / 58) |
| In-page popover and menu | menu 10, padding 4, item 28 | same | unchanged; the radius follows the platform |
| In-page dock, bubble, launcher paddings | n/a (Speak Kit only) | not compared | unchanged |

Not compared because Lockix has no counterpart: reader and library pages (own layouts), the mini player, the in-page dock, bubble and launcher.
