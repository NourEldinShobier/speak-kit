# State matrix

One row per feature, one column per edge case. Each cell names the design frame id (`designs/`, mapped in `docs/screen-map.md`) or the test that covers it; `gap` means neither is known to cover it and the cell needs a frame or a test; `n/a` means the case cannot occur. Applies to: v0.3.0, written 2026-11-01 from `docs/screen-map.md` and `docs/testing.md`; cells were not re-checked against the code. Rule ids D18 and U16 in `docs/engineering/ostio-practices.md`. A work package that adds or changes a screen updates its row.

Columns: **Empty** (no data, first run), **Large** (very long titles, 5,000 paragraphs, many items), **Down** (app not running, engine missing or failed, offline), **Narrow** (small popup, narrow window, 200 % zoom), **Theme** (light and dark).

## Extension
| Feature | Empty | Large | Down | Narrow | Theme |
|---|---|---|---|---|---|
| Popup (idle, selection, loading, playing, paused, finished) | A1, A2 | gap (long page title) | A9, A13, A14, A10; `popup.spec.ts` offline and recovery | gap | A12 (dark); `a11y.spec.ts` |
| Popup restricted page, version mismatch, engine missing | A11, A15; `popup.spec.ts` restricted page | n/a | K5; gap for engine missing | gap | `a11y.spec.ts` |
| In-page launcher, selection bubble, play gutter | B1 to B3 | `perf.spec.ts` 5,000 paragraphs under 50 ms | B9 | n/a | B21 (dark) |
| In-page dock (preparing, reading, paused, finished) | B4 to B8 | `perf.spec.ts` 5,000 paragraphs | B9 | gap | B11 (dark) |
| Reader view | B10 | `perf.spec.ts` extraction; gap for rendering 5,000 paragraphs | gap | gap | B12 (dark) |
| Options: connection, voice, highlighting, shortcuts, sites | C1 | gap (many sites) | C2, C3 | gap | C8 (dark) |
| Side panel queue and outline | C10 (empty) | C9; gap (500 queue items) | gap | `a11y.spec.ts` side panel | C11 (dark) |
| Edge launcher options | C12 | n/a | n/a | gap | gap |

## Desktop
| Feature | Empty | Large | Down | Narrow | Theme |
|---|---|---|---|---|---|
| Setup wizard (welcome, engine, download, connect, ready) | D1 | n/a | D4, D5 (paused), D3 (no GPU) | gap | D8 (dark); `smoke.test.ts` first run |
| Library (list, add, search, delete, drag) | E1 (empty) | gap (500 documents, very long title) | n/a (works with the engine down, A9) | gap | gap |
| Reader (text, PDF, OCR, search, sleep timer) | F1 | gap (PDF with 1,000 pages) | gap | gap | gap |
| Voices and cloning | G1 | gap (many cloned voices) | G-series engine banners (ES1) | gap | gap |
| Engines page (Kokoro, Chatterbox install) | n/a | n/a | K1, K9, K10 | gap | gap |
| Settings pages | H1 | n/a | n/a | gap | `shell.test.ts` every settings page |
| Export (WAV, MP3, background) | J1 | gap (10-hour document) | K1; `system.test.ts` | gap | gap |
| Tray menu and icon | I1 | n/a | I8 (error); `shell.test.ts` tray state | n/a | I6 (dark) |
| Mini player | I3 | n/a | I9 | n/a | gap |
| Toasts (shortcut) | I4 | n/a | K8 | n/a | gap |
| Update card | H9 | n/a | n/a (unsupported build reports "unsupported") | gap | gap |
| Errors: port in use, low disk, checksum failed | K2, K7 | n/a | K3, K4 | gap | gap |

## Server and engines (no UI)
| Feature | Empty | Large | Down | Narrow | Theme |
|---|---|---|---|---|---|
| `/v1/speak` stream | n/a | `maxQueue` 8 and `429 busy` (server tests) | engine error frame `synthesis-failed` | n/a | n/a |
| Export jobs | n/a | 16-job cap (server tests) | gap (write error during export, refactor plan G46) | n/a | n/a |
| Cloned voices | n/a | 40 MB clip cap | `clip-rejected` checks | n/a | n/a |

## Rule for new cells
When a cell is `gap`, add the frame to `designs/` or the test, then replace the word with the id or test file. Do not delete a row to remove a gap.
