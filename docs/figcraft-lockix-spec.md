# Lockix design system, as drawn in FigCraft (for editing speakkit.figcraft)

Source: `D:\workspaces\lockix\designs\Secrets Watchman - Desktop.figcraft` (9 pages: Tokens, Components, Screens A to G).
Key frames: Programs table `985`, Settings `1321`, Settings group tray `1405`, Settings sidebar `1825`, Select `20011`, Switch `95`, Segmented `90`, Pill `68`, Button/Primary `111`, Button/Secondary `45`, Button/Icon `200`, Cell/Name `104`, Row/Vault `149`.
Read it with `get_nodes` and `document` set to that file's path. Never edit that file. Never switch the target document away from `speakkit`.

## Tokens
- Font: Inter Medium for everything. Page title 22/26. Section heading 15/20. Body 13/20. Meta 12/16.
- Ink: text `#1B2230`, secondary `#475467`, meta `#5F6A7D`, placeholder `#6B7280`, icon `#344054` / `#475467`.
- Surfaces: window `#F0F0F0`. Panel white, r10, shadow 0 0 4 at 6%. Tray `#F4F4F4`, r14, padding 4. Card white, r10, ring `#EBEBEB` (drop shadow spread 1, blur 0) plus `0 1 2` at 5%.
- Lines: row divider `#ECECEC` 1 px. Control ring `#E5E5E5` 1 px inside.
- Radii: window panel 10, tray 14, card 10, control 8, tab 6, chip 6, pill 999, switch 10, tile 8.

## Controls (all text 13/20 Medium unless noted)
- **Secondary button / Search field / Select:** 36 high, r8, white, 1 px `#E5E5E5`, shadow `0 1 2` at 6%. Icon 16 at x13, label at x35 (or x13 without icon). Select: label x13, chevron 16 at right 13, stroke `#475467` 1.5.
- **Primary button:** `#201E25`, text `#FAFAFA`, r8, shadow `0 2 4` at 10%. 40 high in dialogs and cards (label 14/Medium), 36 high in toolbars (13).
- **Icon button:** 28x28, r8, white, 1 px `#E5E5E5`, shadow `0 1 2` at 6%, icon 16 at 6,6.
- **Search field:** 36 high. Search icon at x13, placeholder at x37, kbd chip 20x20 r4 `#ECECEC` at the right with 8 px margin.
- **Filter segmented:** container 32 high, r8, `#ECECEC`, 4 px padding. Tabs 24 high, r6. Active tab white with shadow `0 1 3` at 12%. Tab text 13; counts 12 in `#5F6A7D`.
- **Decision segmented:** container 32 high, `#EFEFEF`, r8. Tabs 28 high r6 at 2 px inset. Active tab is tinted: Allow `#D5F3E0` / `#17693D`, Block `#FFE4E5` / `#A61B1B`, Ask `#FFEBCF` / `#9A5200`, each with a 1 px ring in the text colour.
- **Pill:** 20 high, r999, 12/Medium, side padding 9. Allowed/ok `#D5F3E0` ring+text `#17693D`. Blocked/error `#FFE4E5` / `#A61B1B`. Asked/warn `#FFEBCF` / `#9A5200`. Neutral `#F0F0F0`, text `#5F6A7D`, no ring.
- **Chip/Code:** 22 high, r6, `#F4F4F4`, text 12 `#475467`, padding 8.
- **Switch:** 32x20, r10. Off: fill `#ECEDEF`, ring `#C3C6CC`, thumb 14 white with ring `#C3C6CC` at (3,3). On: fill `#201E25`, no ring, thumb 14 white at (15,3).
- **Slider:** track 168x4, r2, `#ECECEC`. Fill `#201E25`, r2, same height. Thumb ellipse 18, white, 1 px `#C3C6CC`, shadow `0 1 2` at 10%, centred on the fill end and 7 px above the track top (track y = row y+20 for a 43 px row). Value text to the right: width 80, right-aligned, 13 `#1B2230`. Optional mark: 2x12 r1 `#FD9812`.
- **Checkbox:** 16, r5, checked fill `#201E25` with a white check; unchecked white with ring `#C3C6CC`.
- **Rail / nav item:** 36 high, r8; selected fill `#F0F0F0`; icon 16, label 13 `#475467`.

## Table (Programs, Vaults, Activity, Library)
- Page: title 22/26 at the content column's left edge, count pill right of it, description 13/20 `#5F6A7D` below. Toolbar row below: filter segmented on the left, search field (36 high, 240 wide) on the right, primary action button 36 high at the far right of the title row.
- Table = tray (`#F4F4F4`, r14, padding 4). Header row inside the tray is 40 high; `th` texts 12/16 Medium `#5F6A7D` at y11. Below it the white card (r10, ring + shadow) holds rows.
- Row: 48 high, 1 px `#ECECEC` divider between rows, left padding 12. Name cell: tile 32x32 r8 `#F4F4F4` with a 16 icon, then title 13/18 `#1B2230` and meta 12/16 `#5F6A7D` stacked (34 high total, 12 px from the tile). Other cells: 13/20 `#5F6A7D` or `#475467`, vertically centred. Row menu is an icon button 28x28 at the right, 12 px from the edge.
- Library mapping: columns Title (tile, title, source), Status (pill), Duration, Added; menu button last.

## Settings
- Nav panel: white, r10, shadow 0 0 4 at 6%, 250 wide, full height. "Settings" 13/Medium `#1B2230` at (14,12); panel-toggle icon 16 at right. Items 36 high (selected bg `#F0F0F0`, r8, 230 wide at x-10), icon 16 at x0, label 13 `#475467` at x26, items 38 apart starting y62.
- Page: title 22/26, subtitle 13/20 `#5F6A7D` under it, groups start 36 below the subtitle.
- Group = tray `#F4F4F4` r14, padding 4. Group label (13/20 `#1B2230`) at x22, y9. White card (r10, ring + shadow) at (4,37) holds rows.
- Row: 43 high with title only, 56 high with description. Title 13/20 `#1B2230` at (16,12). Description 12/16 `#5F6A7D` at (16,30). Divider 1 px `#ECECEC` between rows. Control right-aligned, 16 from the card edge, vertically centred. Switch at the right; slider (168 + 80 value) at the right; select 36 high; checkbox groups inline at the right.
- Settings pages never use bare section headings with a floating card; every group is a tray with a label.

## Things we keep (not in Lockix)
Reader highlight yellow, Tabler icons, Speak Kit logo, white play/pause icons on filled buttons, per-platform radii (Windows panel 8).
